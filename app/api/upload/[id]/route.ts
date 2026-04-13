import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { unlink } from "fs/promises";
import path from "path";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload) {
    return Response.json({ error: "文件不存在" }, { status: 404 });
  }

  // 删除磁盘文件（忽略不存在的情况）
  try {
    const diskPath = path.join(process.cwd(), "public", upload.filePath);
    await unlink(diskPath);
  } catch {
    // 文件不存在则跳过
  }

  await prisma.upload.delete({ where: { id } });

  return Response.json({ success: true });
}
