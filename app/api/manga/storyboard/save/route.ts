import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import type { MangaPanelData } from "@/lib/script/mangaTypes";

export async function POST(request: NextRequest) {
  const { episodeId, panels } = await request.json() as { episodeId: string; panels: MangaPanelData[] };
  if (!episodeId || !panels?.length) {
    return Response.json({ error: "缺少参数" }, { status: 400 });
  }

  // 删除旧的 panels，批量创建新的
  await prisma.mangaPanel.deleteMany({ where: { episodeId } });
  const saved = await prisma.mangaPanel.createMany({
    data: panels.map((p) => ({
      episodeId,
      panelNumber: p.panelNumber,
      description: p.description,
      prompt: p.prompt,
      characters: p.characters ?? [],
      mood: p.mood ?? "",
      dialogue: p.dialogue ?? null,
      innerMonologue: p.innerMonologue ?? null,
      sfx: p.sfx ?? null,
      expressionType: p.expressionType ?? null,
      panelSize: p.panelSize ?? "medium",
      imageStatus: "pending",
    })),
  });

  const result = await prisma.mangaPanel.findMany({
    where: { episodeId },
    orderBy: { panelNumber: "asc" },
  });

  return Response.json(result, { status: 201 });
}
