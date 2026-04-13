import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/providers";
import { buildShotPrompt, findReferenceImageUrls } from "@/lib/video/shotUtils";

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/** 批量并发生成所有分镜视频，SSE 推送每镜头完成事件 */
export async function POST(request: NextRequest) {
  const { episodeId, projectId, seriesId, model } = await request.json();

  if (!episodeId || !projectId) {
    return Response.json({ error: "缺少必要参数" }, { status: 400 });
  }

  const shots = await prisma.shot.findMany({
    where: { episodeId },
    orderBy: { shotNumber: "asc" },
  });

  if (shots.length === 0) {
    return Response.json({ error: "该集暂无分镜" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const total = shots.length;

  // 预先将所有镜头置为 processing
  await prisma.shot.updateMany({
    where: { episodeId },
    data: { videoStatus: "processing", videoUrl: null, videoTaskId: null },
  });

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(sseEvent(data)));

      enqueue({ type: "batch_start", total });

      try {
        await Promise.all(
          shots.map(async (shot) => {
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
                where: { id: shot.id },
                data: {
                  videoTaskId: job.id,
                  videoStatus: job.status,
                  videoUrl: job.videoUrl ?? null,
                },
              });

              enqueue({
                type: "shot_done",
                shotId: shot.id,
                shotNumber: shot.shotNumber,
                total,
                status: job.status,
                videoUrl: job.videoUrl ?? null,
                referencesUsed: referenceImageUrls,
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              await prisma.shot.update({
                where: { id: shot.id },
                data: { videoStatus: "failed" },
              });
              enqueue({
                type: "shot_done",
                shotId: shot.id,
                shotNumber: shot.shotNumber,
                total,
                status: "failed",
                error: msg,
              });
            }
          })
        );

        await prisma.project.update({
          where: { id: projectId },
          data: { status: "done" },
        });

        enqueue({ type: "all_done", total });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        enqueue({ type: "error", message: msg });
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
