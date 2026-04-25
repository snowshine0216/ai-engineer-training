import { describe, it, expect } from "vitest";
import { parseServerEnv } from "../../../lib/config/env";

describe("parseServerEnv (boolean coercion edges)", () => {
  it.each([
    ["true", true],
    ["1", true],
    ["false", false],
    ["0", false],
  ])("LOG_FILE_ENABLED='%s' → %s", (raw, parsed) => {
    const env = parseServerEnv({
      OPENAI_BASE_URL: "https://api.example.com/v1",
      OPENAI_API_KEY: "sk-test",
      DEFAULT_MODEL: "gpt-4o-mini",
      LOG_FILE_ENABLED: raw,
    });
    expect(env.LOG_FILE_ENABLED).toBe(parsed);
  });
});
