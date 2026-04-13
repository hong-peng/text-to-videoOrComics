import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seriesId = searchParams.get("seriesId");
  if (!seriesId) return Response.json({ error: "缺少 seriesId" }, { status: 400 });

  const models = await prisma.characterModel.findMany({
    where: { seriesId },
    orderBy: [{ name: "asc" }, { version: "asc" }],
  });

  return Response.json(models);
}
