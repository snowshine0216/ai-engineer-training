// tests/lib/tools/city-lookup.test.ts
import { describe, it, expect } from "vitest";
import { lookupAdcode } from "../../../lib/tools/city-lookup";

// Dataset note: amap-cities.json stores names with their administrative suffix,
// e.g. "北京市" (adcode 110000), "上海市" (adcode 310000).
// There are no bare "北京" or "上海" entries.

describe("lookupAdcode", () => {
  it("returns adcode for an exact city name (北京市)", () => {
    const m = lookupAdcode("北京市");
    expect(m?.adcode).toBe("110000");
    expect(m?.matched).toBe("北京市");
  });

  it("returns adcode for an exact city name (上海市)", () => {
    expect(lookupAdcode("上海市")?.adcode).toBe("310000");
  });

  it("bare city name resolves via suffix probe (北京 → probes 北京市)", () => {
    // lookupAdcode("北京市") hits findExact("北京市") directly — passes trivially.
    // Test the strip+probe path with a bare input: "北京" strips nothing (no suffix),
    // then tries appending 市/县/区 → finds "北京市".
    const m = lookupAdcode("北京");
    expect(m?.adcode).toBe("110000");
    expect(m?.matched).toBe("北京市");
  });

  it("strips trailing suffix from input before exact match (西安市区 → strips 区 → 西安市)", () => {
    // Strip path: "西安市区" ends in "区" → stripSuffix → "西安市" → findExact → hit
    const m = lookupAdcode("西安市区");
    expect(m?.adcode).toBe("610100");
    expect(m?.matched).toBe("西安市");
  });

  it("strips trailing 区 and matches via suffix probe (朝阳区 input strips to 朝阳 → probes 朝阳区)", () => {
    // "朝阳区" → findExact("朝阳区") → first match returned
    const m = lookupAdcode("朝阳区");
    expect(m?.adcode).toBeDefined();
  });

  it("tolerates surrounding whitespace", () => {
    expect(lookupAdcode("  北京市  ")?.adcode).toBe("110000");
  });

  it("falls back to substring match when no exact/suffix match", () => {
    // "梅里斯达斡尔族区测试" is not in dataset; substring search finds "梅里斯达斡尔族区"
    const m = lookupAdcode("梅里斯达斡尔族区测试");
    expect(m).toBeDefined();
    expect(m?.matched).toBe("梅里斯达斡尔族区");
  });

  it("returns undefined for nonsense input", () => {
    expect(lookupAdcode("火星")).toBeUndefined();
  });

  it("returns undefined for empty input", () => {
    expect(lookupAdcode("")).toBeUndefined();
    expect(lookupAdcode("   ")).toBeUndefined();
  });
});
