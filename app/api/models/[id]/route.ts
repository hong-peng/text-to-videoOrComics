import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { promises as fs } from "fs";
import path from "path";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { partId } = await request.json() as { partId: string };

  if (!partId) {
    return Response.json({ error: "缺少 partId" }, { status: 400 });
  }

  const model = await prisma.characterModel.findUnique({ where: { id } });
  if (!model) {
    return Response.json({ error: "建模不存在" }, { status: 404 });
  }
  if (model.sourcePartId !== partId) {
    return Response.json({ error: "无权删除其他子项目创建的建模" }, { status: 403 });
  }

  // 删除图片文件
  try {
    const filePath = path.join(process.cwd(), "public", model.imageUrl);
    await fs.unlink(filePath);
  } catch { /* 文件不存在则忽略 */ }

  await prisma.characterModel.delete({ where: { id } });

  // 如果删掉的是激活版本，把上一个版本激活
  if (model.isActive) {
    const prev = await prisma.characterModel.findFirst({
      where: { seriesId: model.seriesId, name: model.name, entityType: model.entityType },
      orderBy: { version: "desc" },
    });
    if (prev) {
      await prisma.characterModel.update({ where: { id: prev.id }, data: { isActive: true } });
    }
  }

  return new Response(null, { status: 204 });
}
