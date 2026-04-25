// lib/config/env.ts
import { z, type ZodIssue } from "zod";

const nonEmptyString = z.string().trim().min(1);

// Treats "" and whitespace-only strings as absent so optional env vars
// set to blank in .env files don't trip validation.
const blankToUndefined = (v: unknown) =>
  typeof v === "string" && !v.trim() ? undefined : v;
const optionalNonEmptyString = z.preprocess(blankToUndefined, nonEmptyString.optional());
const optionalUrl = z.preprocess(blankToUndefined, z.string().url().optional());

const booleanFlagSchema = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .default("false")
  .transform((v) => v === "true" || v === "1");

export const serverEnvSchema = z.object({
  OPENAI_BASE_URL: z.string().url(),
  OPENAI_API_KEY: nonEmptyString,
  DEFAULT_MODEL: nonEmptyString,
  // Langfuse — optional locally, required on the deployed demo checklist (not enforced in code)
  LANGFUSE_PUBLIC_KEY: optionalNonEmptyString,
  LANGFUSE_SECRET_KEY: optionalNonEmptyString,
  LANGFUSE_HOST: optionalUrl,
  // Demo mode — hides the fake-failure toggle when false
  DEMO_MODE: booleanFlagSchema,
  // Best-effort per-process request budget for the public shared URL
  DEMO_REQUEST_BUDGET: z.coerce.number().int().positive().optional().default(50),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

const formatIssue = ({ path, message }: ZodIssue) =>
  `${path.join(".")}: ${message}`;

export const parseServerEnv = (env: Record<string, string | undefined>): ServerEnv => {
  const result = serverEnvSchema.safeParse(env);

  if (!result.success) {
    const details = result.error.issues.map(formatIssue).join("; ");
    throw new Error(`Invalid server environment: ${details}`);
  }

  return result.data;
};

export const getServerEnv = (): ServerEnv => parseServerEnv(process.env);
