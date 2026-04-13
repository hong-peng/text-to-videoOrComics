import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sdGenerate } from "@/lib/sd";
import { seedreamGenerate } from "@/lib/providers/seedream";
import { promises as fs } from "fs";
import path from "path";

// ── 漫画风格锁定参数（SD）────────────────────────────────────────
const MANGA_STYLE_PREFIX =
  "masterpiece, best quality, anime style, manga illustration, cel shading, clean linework, flat color, 2d illustration,";

const MANGA_NEGATIVE =
  "photorealistic, 3d render, realistic photo, photograph, cgi, blurry, low quality, " +
  "extra limbs, bad anatomy, deformed, watermark, signature, text, extra fingers, " +
  "realistic skin, depth of field, bokeh, lens flare, film grain, noisy";

const MANGA_STEPS = 30;
const MANGA_CFG = 9.0;
const MANGA_SEED = 42;

// ── Seedream 漫画风格前缀（中文）─────────────────────────────────
const SEEDREAM_MANGA_PREFIX =
  "动漫插画风格，清晰线稿，平涂配色，高对比度，";

function stripStylePrefix(prompt: string): string {
  const styleKeywords = [
    "manga panel", "manga style", "anime style", "cel shading", "clean linework",
    "flat colors", "flat color", "black and white", "black and white ink",
    "high contrast", "masterpiece", "best quality", "highly detailed",
    "manga illustration", "2d illustration", "character reference sheet",
  ];
  let result = prompt;
  for (const kw of styleKeywords) {
    result = result.replace(new RegExp(`(^|,\\s*)${kw}(,\\s*|$)`, "gi"), ", ");
  }
  return result.replace(/^[,\s]+|[,\s]+$/g, "").replace(/,\s*,/g, ",").trim();
}

export async function POST(request: NextRequest) {
  const { panelId, imageProvider = "sd" } = await request.json() as {
    panelId: string;
    imageProvider?: "sd" | "seedream";
  };
  if (!panelId) return Response.json({ error: "缺少 panelId" }, { status: 400 });

  const panel = await prisma.mangaPanel.findUnique({ where: { id: panelId } });
  if (!panel) return Response.json({ error: "格不存在" }, { status: 404 });

  await prisma.mangaPanel.update({ where: { id: panelId }, data: { imageStatus: "processing" } });

  try {
    const dir = path.join(process.cwd(), "public", "manga", panel.episodeId);
    await fs.mkdir(dir, { recursive: true });
    const filename = `panel_${panel.panelNumber}.png`;
    const filePath = path.join(dir, filename);

    if (imageProvider !== "sd") {
      const [rawPositive] = panel.prompt.split("||").map((s) => s.trim());
      const contentPart = rawPositive;
      const positivePrompt = `${SEEDREAM_MANGA_PREFIX}${contentPart}`;

      const result = await seedreamGenerate(positivePrompt, { size: "1024x1536", model: imageProvider });
      const imgRes = await fetch(result.url);
      if (!imgRes.ok) throw new Error(`下载图片失败: ${result.url}`);
      await fs.writeFile(filePath, Buffer.from(await imgRes.arrayBuffer()));
    } else {
      const [rawPositive] = panel.prompt.split("||").map((s) => s.trim());
      const contentPart = stripStylePrefix(rawPositive);
      const positivePrompt = `${MANGA_STYLE_PREFIX} ${contentPart}`;

      const result = await sdGenerate({
        prompt: positivePrompt,
        negative_prompt: MANGA_NEGATIVE,
        width: 512,
        height: 768,
        steps: MANGA_STEPS,
        cfg: MANGA_CFG,
        seed: MANGA_SEED,
      });

      const image = result.images[0];
      if (!image) throw new Error("SD 未返回图片");
      await fs.writeFile(filePath, Buffer.from(image.data, "base64"));
    }

    const imageUrl = `/manga/${panel.episodeId}/${filename}`;
    const updated = await prisma.mangaPanel.update({
      where: { id: panelId },
      data: { imageStatus: "completed", imageUrl },
    });

    return Response.json(updated);
  } catch (e) {
    await prisma.mangaPanel.update({ where: { id: panelId }, data: { imageStatus: "failed" } });
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
