import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const series = await prisma.series.findUnique({
    where: { id },
    include: {
      parts: {
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { episodes: true } } },
      },
      characterModels: {
        orderBy: [{ name: "asc" }, { version: "asc" }],
      },
    },
  });
  if (!series) {
    return Response.json({ error: "系列不存在" }, { status: 404 });
  }
  return Response.json(series);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.series.delete({ where: { id } });
  return new Response(null, { status: 204 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const series = await prisma.series.update({
    where: { id },
    data: body,
  });
  return Response.json(series);
}
