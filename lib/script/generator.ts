import { generateScript, generateScriptStream } from "../claude";
import type { NovelAnalysis, ScriptContent } from "./types";

export async function generateEpisodeScript(
  analysis: NovelAnalysis,
  episodeNum: number,
  totalEpisodes: number = 10
): Promise<ScriptContent> {
  return generateScript(analysis, episodeNum, totalEpisodes);
}

export async function* generateEpisodeScriptStream(
  analysis: NovelAnalysis,
  episodeNum: number,
  totalEpisodes: number = 10
): AsyncGenerator<string> {
  yield* generateScriptStream(analysis, episodeNum, totalEpisodes);
}
