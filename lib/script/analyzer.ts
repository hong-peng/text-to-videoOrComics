import { analyzeNovel } from "../claude";
import type { NovelAnalysis } from "./types";

export async function analyzeNovelContent(
  text: string
): Promise<NovelAnalysis> {
  return analyzeNovel(text);
}
