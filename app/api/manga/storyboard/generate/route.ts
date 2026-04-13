import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { generateMangaStoryboardStream } from "@/lib/claude";
import type { ScriptContent } from "@/lib/script/types";
import type { NovelAnalysis } from "@/lib/script/types";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { episodeId, projectId } = await request.json();
  if (!episodeId || !projectId) {
    return Response.json({ error: "缺少参数" }, { status: 400 });
  }

  const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
  if (!episode) return Response.json({ error: "集数不存在" }, { status: 404 });

  const analysis = await prisma.analysis.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generateMangaStoryboardStream(
          episode.scriptContent as unknown as ScriptContent,
          episode.episodeNumber,
          analysis as NovelAnalysis | null,
        )) {
          controller.enqueue(encoder.encode(chunk));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
