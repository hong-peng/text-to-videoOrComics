import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeNovelStream } from "@/lib/claude";
import { jsonrepair } from "jsonrepair";
import type { NovelAnalysis } from "@/lib/script/types";

export const maxDuration = 300;

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const { projectId } = await request.json();
  if (!projectId) {
    return Response.json({ error: "缺少 projectId" }, { status: 400 });
  }

  const upload = await prisma.upload.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  if (!upload?.rawText) {
    return Response.json({ error: "请先上传文件" }, { status: 400 });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "analyzing" },
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(sseEvent(data)));

      let fullText = "";

      try {
        for await (const chunk of analyzeNovelStream(upload.rawText!)) {
          fullText += chunk;
          enqueue({ type: "chunk", text: chunk });
        }

        const jsonStart = fullText.indexOf("{");
        if (jsonStart === -1) throw new Error("分析结果格式错误：未找到 JSON");

        // jsonrepair handles truncated JSON, missing commas, unescaped newlines, etc.
        const raw = fullText.slice(jsonStart);
        const analysis: NovelAnalysis = JSON.parse(jsonrepair(raw));

        const saved = await prisma.analysis.create({
          data: {
            projectId,
            characters: analysis.characters as object[],
            scenes: analysis.scenes as object[],
            plotPoints: analysis.plotPoints as object[],
          },
        });

        await prisma.project.update({
          where: { id: projectId },
          data: { status: "scripting" },
        });

        enqueue({ type: "done", analysis: saved });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        enqueue({ type: "error", error: msg });
      } finally {
        controller.close();
      }
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
