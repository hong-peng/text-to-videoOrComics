import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { generateEpisodeScriptStream } from "@/lib/script/generator";
import type { NovelAnalysis } from "@/lib/script/types";

export async function POST(request: NextRequest) {
  const { projectId, episodeNumber, totalEpisodes } = await request.json();

  if (!projectId || !episodeNumber) {
    return Response.json({ error: "缺少必要参数" }, { status: 400 });
  }

  const analysis = await prisma.analysis.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  if (!analysis) {
    return Response.json({ error: "请先完成内容分析" }, { status: 400 });
  }

  const novelAnalysis = {
    characters: analysis.characters,
    scenes: analysis.scenes,
    plotPoints: analysis.plotPoints,
  } as unknown as NovelAnalysis;

  const encoder = new TextEncoder();
  let fullText = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generateEpisodeScriptStream(
          novelAnalysis,
          episodeNumber,
          totalEpisodes ?? 10
        )) {
          fullText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }

        const start = fullText.indexOf("{");
        const end = fullText.lastIndexOf("}");
        if (start !== -1 && end !== -1) {
          let raw = fullText.slice(start, end + 1);
          raw = raw.replace(/,(\s*[}\]])/g, "$1");
          try {
            const scriptContent = JSON.parse(raw);
          const existing = await prisma.episode.findFirst({
            where: { projectId, episodeNumber },
          });
          if (existing) {
            await prisma.episode.update({
              where: { id: existing.id },
              data: { scriptContent, title: scriptContent.hook?.slice(0, 30) },
            });
          } else {
            await prisma.episode.create({
              data: {
                projectId,
                episodeNumber,
                scriptContent,
                title: scriptContent.hook?.slice(0, 30),
              },
            });
          }
          await prisma.project.update({
            where: { id: projectId },
            data: { status: "storyboarding" },
          });
          } catch {
            // JSON 解析失败时静默忽略，流已输出给前端
          }
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
