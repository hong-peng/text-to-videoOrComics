import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import PartsPageClient from "./PartsPageClient";

interface Params {
  seriesId: string;
}

export default async function SeriesPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { seriesId } = await params;

  const [series, parts] = await Promise.all([
    prisma.series.findUnique({ where: { id: seriesId } }),
    prisma.project.findMany({
      where: { seriesId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { episodes: true } } },
    }),
  ]);

  if (!series) notFound();

  return (
    <PartsPageClient series={series} initialParts={parts} seriesId={seriesId} />
  );
}
