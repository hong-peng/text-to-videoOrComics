import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { parseTxt } from "@/lib/parsers/txt";
import { parsePdf } from "@/lib/parsers/pdf";
import { parseEpub } from "@/lib/parsers/epub";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const projectId = formData.get("projectId") as string | null;

  if (!file || !projectId) {
    return Response.json({ error: "缺少文件或项目ID" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const ext = path.extname(file.name).toLowerCase().slice(1);
  if (!["txt", "pdf", "epub", "md"].includes(ext)) {
    return Response.json(
      { error: "仅支持 TXT、MD、PDF、EPUB 格式" },
      { status: 400 }
    );
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", projectId);
  await mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, file.name);
  await writeFile(filePath, buffer);

  let rawText = "";
  if (ext === "txt" || ext === "md") {
    ({ text: rawText } = await parseTxt(buffer));
  } else if (ext === "pdf") {
    ({ text: rawText } = await parsePdf(buffer));
  } else if (ext === "epub") {
    ({ text: rawText } = await parseEpub(buffer));
  }

  const upload = await prisma.upload.upsert({
    where: { projectId_filename: { projectId, filename: file.name } },
    update: {
      filePath: `/uploads/${projectId}/${file.name}`,
      fileType: ext,
      rawText,
    },
    create: {
      projectId,
      filename: file.name,
      filePath: `/uploads/${projectId}/${file.name}`,
      fileType: ext,
      rawText,
    },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "analyzing" },
  });

  return Response.json({ upload, textLength: rawText.length }, { status: 201 });
}
