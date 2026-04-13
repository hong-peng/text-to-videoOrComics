import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const series = await prisma.series.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { parts: true, characterModels: true } },
    },
  });
  return Response.json(series);
}

export async function POST(request: NextRequest) {
  const { name, type } = await request.json();
  if (!name?.trim()) {
    return Response.json({ error: "系列名称不能为空" }, { status: 400 });
  }
  const series = await prisma.series.create({
    data: { name: name.trim(), type: type === "manga" ? "manga" : "video" },
  });
  return Response.json(series, { status: 201 });
}
