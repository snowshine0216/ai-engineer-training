// tests/lib/tools/index.test.ts
import { describe, it, expect } from "vitest";
import { TOOL_REGISTRY, getTool, listTools, toSDKTool } from "../../../lib/tools";

describe("tools registry", () => {
  it("registers amap-weather and tavily-search", () => {
    expect(Object.keys(TOOL_REGISTRY).sort()).toEqual(["amap-weather", "tavily-search"]);
  });

  it("listTools returns both specs", () => {
    expect(listTools().map((s) => s.id).sort()).toEqual(["amap-weather", "tavily-search"]);
  });

  it("getTool returns the spec by id", () => {
    expect(getTool("amap-weather")?.id).toBe("amap-weather");
    expect(getTool("tavily-search")?.id).toBe("tavily-search");
  });

  it("getTool returns undefined for an unknown id", () => {
    expect(getTool("nope")).toBeUndefined();
  });

  it("toSDKTool returns a built SDK tool for known ids, null otherwise", () => {
    expect(toSDKTool("amap-weather")).not.toBeNull();
    expect(toSDKTool("tavily-search")).not.toBeNull();
    expect(toSDKTool("nope")).toBeNull();
  });
});
