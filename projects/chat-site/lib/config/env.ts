// lib/config/env.ts
import { z, type ZodIssue } from "zod";

const nonEmptyString = z.string().trim().min(1);

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
  LANGFUSE_PUBLIC_KEY: nonEmptyString.optional(),
  LANGFUSE_SECRET_KEY: nonEmptyString.optional(),
  LANGFUSE_HOST: z.string().url().optional(),
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
