export const config = {
  DEFAULT_PROVIDER: process.env.DEFAULT_PROVIDER ?? "seedance",
  RUNWAY_API_KEY: process.env.RUNWAY_API_KEY ?? "",
  KLING_ACCESS_KEY: process.env.KLING_ACCESS_KEY ?? "",
  KLING_SECRET_KEY: process.env.KLING_SECRET_KEY ?? "",
  SEEDANCE_API_KEY: process.env.SEEDANCE_API_KEY ?? "",
  SEEDANCE_MODEL: process.env.SEEDANCE_MODEL ?? "",
  POLL_INTERVAL_MS: Number(process.env.POLL_INTERVAL_MS ?? 5000),
  POLL_TIMEOUT_MS: Number(process.env.POLL_TIMEOUT_MS ?? 300000),
};
