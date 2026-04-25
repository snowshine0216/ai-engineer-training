// tests/lib/agents/registry.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@openai/agents", () => ({
  Agent: vi.fn().mockImplementation((opts: unknown) => ({ __agent: opts })),
}));

import { AGENT_REGISTRY, getAgent, listAgents, buildAgent } from "../../../lib/agents";
import { getPrompt } from "../../../lib/prompts";

describe("agents registry", () => {
  it("contains general and qa-coach with unique ids", () => {
    const ids = Object.keys(AGENT_REGISTRY).sort();
    expect(ids).toEqual(["general", "qa-coach"]);
    const valIds = Object.values(AGENT_REGISTRY).map((s) => s.id);
    expect(new Set(valIds).size).toBe(valIds.length);
  });

  it("getAgent returns the spec by id, undefined for unknown", () => {
    expect(getAgent("general")?.name).toBe("General");
    expect(getAgent("nope")).toBeUndefined();
  });

  it("listAgents returns all specs", () => {
    expect(listAgents()).toHaveLength(2);
  });

  it("every spec.promptId resolves in the prompt registry", () => {
    for (const spec of listAgents()) {
      expect(getPrompt(spec.promptId)?.id).toBe(spec.promptId);
    }
  });

  it("buildAgent constructs an Agent from prompt + model + tools", async () => {
    const { Agent } = await import("@openai/agents");
    const env = { DEFAULT_MODEL: "gpt-4o-mini" } as { DEFAULT_MODEL: string };
    const agent = buildAgent(getAgent("general")!, env) as unknown as { __agent: { name: string; instructions: string; model: string; tools: unknown[] } };
    expect(Agent).toHaveBeenCalledTimes(1);
    expect(agent.__agent.name).toBe("General");
    expect(agent.__agent.instructions).toContain("helpful assistant");
    expect(agent.__agent.model).toBe("gpt-4o-mini");
    expect(agent.__agent.tools).toEqual([]);
  });

  it("buildAgent honors spec.model when present, overriding env DEFAULT_MODEL", async () => {
    const { Agent } = await import("@openai/agents");
    vi.mocked(Agent).mockClear();
    const spec = { ...getAgent("general")!, model: "deepseek-r1" };
    const env = { DEFAULT_MODEL: "gpt-4o-mini" } as { DEFAULT_MODEL: string };
    buildAgent(spec, env);
    expect(vi.mocked(Agent).mock.calls[0][0]).toMatchObject({ model: "deepseek-r1" });
  });
});
