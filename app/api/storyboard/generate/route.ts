import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { generateStoryboardStream } from "@/lib/claude";
import type { NovelAnalysis, ScriptContent } from "@/lib/script/types";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { projectId, episodeId } = await request.json();

  if (!projectId || !episodeId) {
    return Response.json({ error: "缺少必要参数" }, { status: 400 });
  }

  const [episode, analysis] = await Promise.all([
    prisma.episode.findUnique({ where: { id: episodeId } }),
    prisma.analysis.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } }),
  ]);

  if (!episode) {
    return Response.json({ error: "剧集不存在" }, { status: 404 });
  }

  // 直接把 Claude 流转发给客户端，不在流内做 DB 操作（避免超时导致 controller 关闭后写入失败）
  const claudeStream = generateStoryboardStream(
    episode.scriptContent as unknown as ScriptContent,
    episode.episodeNumber,
    analysis as unknown as NovelAnalysis | null,
  );

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of claudeStream) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        console.error("[storyboard/generate] stream error:", err);
        try {
          controller.enqueue(encoder.encode(`\n[ERROR] ${err instanceof Error ? err.message : String(err)}`));
        } catch { /* ignore */ }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}

