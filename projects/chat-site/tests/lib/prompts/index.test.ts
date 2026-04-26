// tests/lib/prompts/index.test.ts
import { describe, it, expect } from "vitest";
import { PROMPT_REGISTRY, getPrompt, listPrompts } from "../../../lib/prompts";

describe("prompts registry", () => {
  it("exposes general and qa-coach prompts", () => {
    expect(getPrompt("general")?.id).toBe("general");
    expect(getPrompt("qa-coach")?.id).toBe("qa-coach");
  });

  it("returns undefined for unknown prompt id", () => {
    expect(getPrompt("nope")).toBeUndefined();
  });

  it("registers customer service prompts", () => {
    expect(getPrompt("customer-service-manager")?.text).toContain("CustomerServiceManager");
    expect(getPrompt("customer-service-order")?.text).toContain("OrderStatusAgent");
    expect(getPrompt("customer-service-logistics")?.text).toContain("LogisticsAgent");
    expect(getPrompt("customer-service-reply")?.text).toContain("ReplySynthesisAgent");
  });

  it("listPrompts returns all registered prompts", () => {
    const ids = listPrompts().map((p) => p.id).sort();
    expect(ids).toEqual(["customer-service-logistics", "customer-service-manager", "customer-service-order", "customer-service-reply", "general", "qa-coach"]);
  });

  it("every prompt id is unique within the registry", () => {
    const ids = Object.keys(PROMPT_REGISTRY);
    const valIds = Object.values(PROMPT_REGISTRY).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(valIds);
  });

  it("every prompt has non-empty text", () => {
    for (const p of listPrompts()) expect(p.text.length).toBeGreaterThan(0);
  });
});
