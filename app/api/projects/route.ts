import { prisma } from "@/lib/db";

export async function GET() {
  // Legacy: return all projects (parts) across all series
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { episodes: true } },
    },
  });
  return Response.json(projects);
}
