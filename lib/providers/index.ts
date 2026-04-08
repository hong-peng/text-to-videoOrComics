import { config } from "../config.js";
import { KlingProvider } from "./kling.js";
import { RunwayProvider } from "./runway.js";
import type { VideoProvider } from "./types.js";

export type { VideoProvider, VideoJob, GenerateOptions, JobStatus } from "./types.js";

const providers: Record<string, () => VideoProvider> = {
  runway: () => new RunwayProvider(),
  kling: () => new KlingProvider(),
};

export function getProvider(name?: string): VideoProvider {
  const providerName = name ?? config.DEFAULT_PROVIDER;
  const factory = providers[providerName];
  if (!factory) {
    throw new Error(
      `Unknown provider "${providerName}". Available: ${Object.keys(providers).join(", ")}`
    );
  }
  return factory();
}
