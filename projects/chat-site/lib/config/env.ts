import { z, type ZodIssue } from "zod";

const nonEmptyString = z.string().trim().min(1);
const openAIApiModeSchema = z
  .enum(["chat_completions", "responses"])
  .optional()
  .default("chat_completions");
const booleanFlagSchema = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .default("false")
  .transform((value) => value === "true" || value === "1");

export const serverEnvSchema = z
  .object({
    OPENAI_BASE_URL: z.string().url(),
    OPENAI_API_KEY: nonEmptyString,
    DEFAULT_MODEL: nonEmptyString,
    OPENAI_API_MODE: openAIApiModeSchema,
    LANGFUSE_PUBLIC_KEY: nonEmptyString,
    LANGFUSE_SECRET_KEY: nonEmptyString,
    LANGFUSE_HOST: z.string().url(),
    OPENAI_AGENTS_ENABLE_TRACING: booleanFlagSchema,
    OPENAI_TRACING_API_KEY: nonEmptyString.optional(),
  })
  .superRefine((env, ctx) => {
    if (env.OPENAI_AGENTS_ENABLE_TRACING && !env.OPENAI_TRACING_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["OPENAI_TRACING_API_KEY"],
        message: "Required when OPENAI_AGENTS_ENABLE_TRACING is true",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

const formatIssue = ({ path, message }: ZodIssue) =>
  `${path.join(".")}: ${message}`;

export const parseServerEnv = (
  env: Record<string, string | undefined>,
): ServerEnv => {
  const result = serverEnvSchema.safeParse(env);

  if (!result.success) {
    const details = result.error.issues.map(formatIssue).join("; ");

    throw new Error(`Invalid server environment: ${details}`);
  }

  return result.data;
};

export const getServerEnv = (): ServerEnv => parseServerEnv(process.env);
