import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/providers";
import { buildShotPrompt, findReferenceImageUrls } from "@/lib/video/shotUtils";

/** 单镜头视频生成（同步等待，直接返回 JSON 结果） */
export async function POST(request: NextRequest) {
  const { shotId, seriesId, model } = await request.json() as {
    shotId: string;
    seriesId?: string;
    model?: string;
  };

  if (!shotId) {
    return Response.json({ error: "缺少 shotId" }, { status: 400 });
  }

  const shot = await prisma.shot.findUnique({ where: { id: shotId } });
  if (!shot) {
    return Response.json({ error: "镜头不存在" }, { status: 404 });
  }

  await prisma.shot.update({
    where: { id: shotId },
    data: { videoStatus: "processing", videoUrl: null, videoTaskId: null },
  });

  // 结构化完整 prompt
  const prompt = buildShotPrompt(shot);

  // 所有匹配的建模图片
  const referenceImageUrls = seriesId
    ? await findReferenceImageUrls(seriesId, shot)
    : [];

  try {
    const provider = getProvider(model);
    const job = await provider.generateVideo(prompt, { referenceImageUrls });

    await prisma.shot.update({
      where: { id: shotId },
      data: {
        videoTaskId: job.id,
        videoStatus: job.status,
        videoUrl: job.videoUrl ?? null,
      },
    });

    return Response.json({
      shotId,
      shotNumber: shot.shotNumber,
      status: job.status,
      videoUrl: job.videoUrl ?? null,
      referencesUsed: referenceImageUrls,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.shot.update({
      where: { id: shotId },
      data: { videoStatus: "failed" },
    });
    return Response.json({ shotId, shotNumber: shot.shotNumber, status: "failed", error: msg }, { status: 500 });
  }
}
