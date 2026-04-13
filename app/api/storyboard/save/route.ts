import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import type { StoryboardData } from "@/lib/storyboard/types";

export async function POST(request: NextRequest) {
  const { projectId, episodeId, storyboard } = await request.json() as {
    projectId: string;
    episodeId: string;
    storyboard: StoryboardData;
  };

  if (!projectId || !episodeId || !storyboard?.shots?.length) {
    return Response.json({ error: "缺少必要参数" }, { status: 400 });
  }

  await prisma.shot.deleteMany({ where: { episodeId } });
  await prisma.shot.createMany({
    data: storyboard.shots.map((shot) => ({
      episodeId,
      shotNumber: shot.shotNumber,
      shotType: shot.shotType,
      cameraMove: shot.cameraMove,
      description: shot.description,
      location: shot.location ?? "",
      lighting: shot.lighting ?? "",
      characters: shot.characters ?? [],
      mood: shot.mood ?? "",
      dialogue: shot.dialogue ?? "",
      duration: shot.duration,
      notes: shot.notes ?? "",
    })),
  });
  await prisma.project.update({
    where: { id: projectId },
    data: { status: "done" },
  });

  return Response.json({ ok: true, count: storyboard.shots.length });
}
