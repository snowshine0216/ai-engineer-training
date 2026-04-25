// tests/lib/agents/registry-extra.test.ts
// Extra coverage for buildAgent error paths not hit by the primary registry test.
import { describe, it, expect, vi } from "vitest";

vi.mock("@openai/agents", () => ({
  Agent: vi.fn().mockImplementation((opts: unknown) => ({ __agent: opts })),
}));

import { buildAgent } from "../../../lib/agents";
import type { AgentSpec } from "../../../lib/agents";

const ENV = { DEFAULT_MODEL: "gpt-4o-mini" } as { DEFAULT_MODEL: string };

describe("buildAgent (error paths)", () => {
  it("throws when the spec references an unknown promptId", () => {
    const badSpec: AgentSpec = {
      id: "test",
      name: "Test",
      description: "d",
      promptId: "does-not-exist" as never,
      toolIds: [],
    };
    expect(() => buildAgent(badSpec, ENV)).toThrow(/unknown promptId/);
  });

  it("resolveTools produces an empty SDK tool list when toolIds is empty", () => {
    // Build a valid spec with no tools — exercises the resolveTools([]) path
    const spec: AgentSpec = {
      id: "general",
      name: "General",
      description: "A helpful assistant",
      promptId: "general",
      toolIds: [],
    };
    const agent = buildAgent(spec, ENV) as unknown as { __agent: { tools: unknown[] } };
    expect(agent.__agent.tools).toEqual([]);
  });
});
