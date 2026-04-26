// lib/config/env.ts
import { z, type ZodIssue } from "zod";

const nonEmptyString = z.string().trim().min(1);

// Treats "" and whitespace-only strings as absent so optional env vars
// set to blank in .env files don't trip validation.
const blankToUndefined = (v: unknown) =>
  typeof v === "string" && !v.trim() ? undefined : v;
const optionalNonEmptyString = z.preprocess(blankToUndefined, nonEmptyString.optional());
const optionalUrl = z.preprocess(blankToUndefined, z.string().url().optional());

const optionalBoolean = z.preprocess(
  blankToUndefined,
  z.enum(["true", "false", "1", "0"]).optional().transform((v) => v === undefined ? undefined : v === "true" || v === "1"),
);

const isVercel = (env: Record<string, string | undefined>): boolean => env.VERCEL === "1";

export const serverEnvSchema = z.object({
  OPENAI_BASE_URL: z.string().url(),
  OPENAI_API_KEY: nonEmptyString,
  DEFAULT_MODEL: nonEmptyString,
  AMAP_API_KEY: nonEmptyString,
  TAVILY_API_KEY: nonEmptyString,
  LANGFUSE_PUBLIC_KEY: optionalNonEmptyString,
  LANGFUSE_SECRET_KEY: optionalNonEmptyString,
  LANGFUSE_HOST: optionalUrl,
  DEMO_REQUEST_BUDGET: z.coerce.number().int().positive().optional().default(50),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional().default("info"),
  LOG_DIR: optionalNonEmptyString,
  LOG_FILE_ENABLED: optionalBoolean,
});

export type ServerEnvParsed = z.infer<typeof serverEnvSchema>;

export type ServerEnv = ServerEnvParsed & {
  LOG_DIR: string;
  LOG_FILE_ENABLED: boolean;
};

const formatIssue = ({ path, message }: ZodIssue) =>
  `${path.join(".")}: ${message}`;

const applyLoggerDefaults = (parsed: ServerEnvParsed, raw: Record<string, string | undefined>): ServerEnv => ({
  ...parsed,
  LOG_DIR: parsed.LOG_DIR ?? "logs",
  LOG_FILE_ENABLED: parsed.LOG_FILE_ENABLED ?? !isVercel(raw),
});

export const parseServerEnv = (env: Record<string, string | undefined>): ServerEnv => {
  const result = serverEnvSchema.safeParse(env);

  if (!result.success) {
    const details = result.error.issues.map(formatIssue).join("; ");
    throw new Error(`Invalid server environment: ${details}`);
  }

  return applyLoggerDefaults(result.data, env);
};

export const getServerEnv = (): ServerEnv => parseServerEnv(process.env);
