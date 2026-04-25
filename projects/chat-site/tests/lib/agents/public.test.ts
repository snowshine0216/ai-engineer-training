// tests/lib/agents/public.test.ts
import { describe, it, expect } from "vitest";
import { toPublic, type PublicAgent } from "../../../lib/agents/public";

describe("toPublic", () => {
  it("strips promptId, toolIds, model — keeps only id, name, description", () => {
    const spec = {
      id: "g",
      name: "General",
      description: "a desc",
      promptId: "p",
      toolIds: ["t1", "t2"],
      model: "m",
    };
    const pub: PublicAgent = toPublic(spec);
    expect(pub).toEqual({ id: "g", name: "General", description: "a desc" });
    expect(pub).not.toHaveProperty("promptId");
    expect(pub).not.toHaveProperty("toolIds");
    expect(pub).not.toHaveProperty("model");
  });
});
