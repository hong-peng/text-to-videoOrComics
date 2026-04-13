import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import ffmpeg from "fluent-ffmpeg";

// 用绝对路径指向 ffmpeg-static 二进制，避免 Next.js 路径重写问题
const FFMPEG_PATH = path.join(
  process.cwd(),
  "node_modules",
  "ffmpeg-static",
  "ffmpeg"
);
ffmpeg.setFfmpegPath(FFMPEG_PATH);

/** 转义 ASS 字幕中的特殊字符 */
function escapeAss(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\N");
}

/** 将秒数格式化为 ASS 时间格式 H:MM:SS.cc */
function toAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/** 生成 ASS 字幕文件内容 */
function buildAssSubtitles(
  shots: { dialogue: string | null; duration: number }[]
): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,42,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,30,30,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let currentTime = 0;
  const events: string[] = [];

  for (const shot of shots) {
    const start = currentTime;
    const end = currentTime + shot.duration;
    if (shot.dialogue && shot.dialogue.trim()) {
      events.push(
        `Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Default,,0,0,0,,${escapeAss(shot.dialogue.trim())}`
      );
    }
    currentTime = end;
  }

  return header + events.join("\n") + "\n";
}

export async function POST(request: NextRequest) {
  const { episodeId } = await request.json();
  if (!episodeId) {
    return Response.json({ error: "缺少 episodeId" }, { status: 400 });
  }

  // 取所有镜头（按序号），用于字幕时间轴；只下载已完成的视频
  const allShots = await prisma.shot.findMany({
    where: { episodeId },
    orderBy: { shotNumber: "asc" },
  });

  const completedShots = allShots.filter(
    (s) => s.videoStatus === "completed" && s.videoUrl
  );

  if (completedShots.length === 0) {
    return Response.json({ error: "没有已完成的镜头视频" }, { status: 400 });
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "merge-"));

  try {
    // 1. 并行下载镜头视频
    const segmentPaths = await Promise.all(
      completedShots.map(async (shot, i) => {
        const res = await fetch(shot.videoUrl!);
        if (!res.ok) throw new Error(`下载镜头 ${shot.shotNumber} 失败: ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const segPath = path.join(workDir, `seg_${String(i).padStart(4, "0")}.mp4`);
        await fs.writeFile(segPath, buf);
        return segPath;
      })
    );

    // 2. concat 列表
    const listPath = path.join(workDir, "list.txt");
    await fs.writeFile(listPath, segmentPaths.map((p) => `file '${p}'`).join("\n"));

    // 3. 先将片段拼接成中间文件（无字幕）
    const rawPath = path.join(workDir, "raw.mp4");
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(["-f concat", "-safe 0"])
        .outputOptions(["-c copy"])
        .output(rawPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    // 4. 生成 ASS 字幕文件（基于 completedShots 的 dialogue 和 duration）
    const assPath = path.join(workDir, "subs.ass");
    const assContent = buildAssSubtitles(
      completedShots.map((s) => ({ dialogue: s.dialogue, duration: s.duration }))
    );
    await fs.writeFile(assPath, assContent, "utf8");

    // 5. 烧录字幕到最终视频（需要重新编码）
    const outputDir = path.join(process.cwd(), "public", "videos");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${episodeId}.mp4`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(rawPath)
        .outputOptions([
          `-vf ass=${assPath}`,
          "-c:v libx264",
          "-preset fast",
          "-crf 23",
          "-c:a aac",
          "-b:a 128k",
          "-movflags +faststart",
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    const publicUrl = `/videos/${episodeId}.mp4`;

    await prisma.episode.update({
      where: { id: episodeId },
      data: { mergedVideoUrl: publicUrl },
    });

    return Response.json({ url: publicUrl });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
