import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      series: { select: { type: true } },
      uploads: true,
      analyses: true,
      episodes: {
        include: { shots: true, mangaPanels: { orderBy: { panelNumber: "asc" } } },
        orderBy: { episodeNumber: "asc" },
      },
    },
  });
  if (!project) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }
  return Response.json(project);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.project.delete({ where: { id } });
  return new Response(null, { status: 204 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const project = await prisma.project.update({
    where: { id },
    data: body,
  });
  return Response.json(project);
}
