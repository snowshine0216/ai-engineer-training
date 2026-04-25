// tests/lib/tools/index.test.ts
import { describe, it, expect } from "vitest";
import { TOOL_REGISTRY, getTool, listTools, toSDKTool } from "../../../lib/tools";

describe("tools registry (empty scaffold)", () => {
  it("registry is empty", () => {
    expect(Object.keys(TOOL_REGISTRY)).toHaveLength(0);
  });

  it("listTools returns []", () => {
    expect(listTools()).toEqual([]);
  });

  it("getTool returns undefined for any id", () => {
    expect(getTool("anything")).toBeUndefined();
  });

  it("toSDKTool returns null for an unknown id", () => {
    expect(toSDKTool("anything")).toBeNull();
  });
});
