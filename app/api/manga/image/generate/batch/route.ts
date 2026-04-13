import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sdGenerate } from "@/lib/sd";
import { seedreamGenerate } from "@/lib/providers/seedream";
import { promises as fs } from "fs";
import path from "path";

export const maxDuration = 300;

// ── 风格锁定参数（SD）────────────────────────────────────────────
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
const SEEDREAM_MANGA_PREFIX = "动漫插画风格，清晰线稿，平涂配色，高对比度，";

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

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
  const { episodeId, imageProvider = "sd" } = await request.json() as {
    episodeId: string;
    imageProvider?: "sd" | "seedream";
  };
  if (!episodeId) return Response.json({ error: "缺少 episodeId" }, { status: 400 });

  const panels = await prisma.mangaPanel.findMany({
    where: { episodeId },
    orderBy: { panelNumber: "asc" },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(sseEvent(data)));

      const dir = path.join(process.cwd(), "public", "manga", episodeId);
      await fs.mkdir(dir, { recursive: true });

      // 并发限制：Seedream API 较稳定可用 3，SD 本地也 3
      const CONCURRENCY = 3;
      let idx = 0;

      async function processPanel(panel: typeof panels[0]) {
        await prisma.mangaPanel.update({
          where: { id: panel.id },
          data: { imageStatus: "processing" },
        });

        try {
          const filename = `panel_${panel.panelNumber}.png`;
          const filePath = path.join(dir, filename);

          if (imageProvider !== "sd") {
            const [rawPositive] = panel.prompt.split("||").map((s) => s.trim());
            const positivePrompt = `${SEEDREAM_MANGA_PREFIX}${rawPositive}`;
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

          const imageUrl = `/manga/${episodeId}/${filename}`;
          await prisma.mangaPanel.update({
            where: { id: panel.id },
            data: { imageStatus: "completed", imageUrl },
          });
          enqueue({ type: "done", panelId: panel.id, panelNumber: panel.panelNumber, imageUrl });
        } catch (e) {
          await prisma.mangaPanel.update({
            where: { id: panel.id },
            data: { imageStatus: "failed" },
          });
          enqueue({ type: "error", panelId: panel.id, error: e instanceof Error ? e.message : String(e) });
        }
      }

      const workers: Promise<void>[] = [];
      async function worker() {
        while (idx < panels.length) {
          const panel = panels[idx++];
          await processPanel(panel);
        }
      }
      for (let i = 0; i < Math.min(CONCURRENCY, panels.length); i++) {
        workers.push(worker());
      }
      await Promise.all(workers);

      enqueue({ type: "complete", total: panels.length });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
