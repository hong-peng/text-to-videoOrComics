import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: seriesId } = await params;
  const parts = await prisma.project.findMany({
    where: { seriesId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { episodes: true } } },
  });
  return Response.json(parts);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: seriesId } = await params;
  const { name } = await request.json();
  if (!name?.trim()) {
    return Response.json({ error: "子项目名称不能为空" }, { status: 400 });
  }
  const part = await prisma.project.create({
    data: { seriesId, name: name.trim() },
  });
  return Response.json(part, { status: 201 });
}
