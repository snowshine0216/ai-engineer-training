// tests/app/api/agents/route.test.ts
import { describe, it, expect } from "vitest";
import { GET } from "../../../../app/api/agents/route";

describe("GET /api/agents", () => {
  it("returns 200 with a list of public agents", async () => {
    const resp = await GET();
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body.agents)).toBe(true);
    expect(body.agents.length).toBeGreaterThan(0);
  });

  it("each agent has id, name, description and NO server-only fields", async () => {
    const resp = await GET();
    const body = await resp.json();
    for (const a of body.agents) {
      expect(typeof a.id).toBe("string");
      expect(typeof a.name).toBe("string");
      expect(typeof a.description).toBe("string");
      expect(a).not.toHaveProperty("promptId");
      expect(a).not.toHaveProperty("toolIds");
      expect(a).not.toHaveProperty("model");
    }
  });

  it("includes the general and qa-coach agents", async () => {
    const resp = await GET();
    const body = await resp.json();
    const ids = body.agents.map((a: { id: string }) => a.id).sort();
    expect(ids).toEqual(["general", "qa-coach"]);
  });
});
