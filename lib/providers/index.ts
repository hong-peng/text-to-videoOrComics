import { config } from "../config";
import { KlingProvider } from "./kling";
import { RunwayProvider } from "./runway";
import { SeedanceProvider, SEEDANCE_MODELS } from "./seedance";
import type { VideoProvider } from "./types";

export type { VideoProvider, VideoJob, GenerateOptions, JobStatus } from "./types";
export { SEEDANCE_MODELS } from "./seedance";

const providers: Record<string, () => VideoProvider> = {
  runway: () => new RunwayProvider(),
  kling: () => new KlingProvider(),
  seedance: () => new SeedanceProvider(),
};

export function getProvider(name?: string): VideoProvider {
  const providerName = name ?? config.DEFAULT_PROVIDER;

  // 如果传入的是 Seedance 的具体 model ID，直接用该 model 初始化
  const isSeedanceModel = SEEDANCE_MODELS.some((m) => m.id === providerName);
  if (isSeedanceModel) {
    return new SeedanceProvider(undefined, providerName);
  }

  const factory = providers[providerName];
  if (!factory) {
    throw new Error(
      `Unknown provider "${providerName}". Available: ${Object.keys(providers).join(", ")}`
    );
  }
  return factory();
}
