import { generateStoryboard } from "../claude";
import type { ScriptContent } from "../script/types";
import type { StoryboardData } from "./types";

export async function generateEpisodeStoryboard(
  script: ScriptContent,
  episodeNumber: number
): Promise<StoryboardData> {
  return generateStoryboard(script, episodeNumber);
}
