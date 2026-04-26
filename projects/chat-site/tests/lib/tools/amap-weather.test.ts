// tests/lib/tools/amap-weather.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { _executeForTest, _clearCacheForTest, amapWeather } from "../../../lib/tools/amap-weather";

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

const httpError = () =>
  new Response("nope", { status: 500 });

const baseLives = {
  status: "1",
  count: "1",
  info: "OK",
  lives: [{
    province: "北京",
    city: "北京市",
    adcode: "110000",
    weather: "晴",
    temperature: "18",
    winddirection: "南",
    windpower: "≤3",
    humidity: "40",
    reporttime: "2026-04-25 12:00:00",
  }],
};

const allForecast = {
  status: "1",
  info: "OK",
  forecasts: [{
    city: "北京市",
    adcode: "110000",
    casts: [
      { date: "2026-04-25", week: "5", dayweather: "晴", nightweather: "多云", daytemp: "20", nighttemp: "10", daywind: "南", nightwind: "南", daypower: "≤3", nightpower: "≤3" },
      { date: "2026-04-26", week: "6", dayweather: "多云", nightweather: "晴", daytemp: "22", nighttemp: "11", daywind: "东", nightwind: "东", daypower: "≤3", nightpower: "≤3" },
    ],
  }],
};

describe("amapWeather", () => {
  beforeEach(() => {
    process.env.AMAP_API_KEY = "test-key";
    vi.spyOn(global, "fetch").mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _clearCacheForTest();
  });

  it("exposes the registry id", () => {
    expect(amapWeather.id).toBe("amap-weather");
  });

  it("returns formatted current conditions on happy path", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(ok(baseLives));
    const out = await _executeForTest({ city: "北京", forecast: false });
    expect(out).toContain("北京");
    expect(out).toContain("18");
    expect(out).toContain("晴");
    expect(global.fetch).toHaveBeenCalledOnce();
    const url = String(vi.mocked(global.fetch).mock.calls[0][0]);
    expect(url).toContain("city=110000");
    expect(url).toContain("extensions=base");
    expect(url).toContain("key=test-key");
  });

  it("returns formatted forecast when forecast=true", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(ok(allForecast));
    const out = await _executeForTest({ city: "北京", forecast: true });
    expect(out).toContain("2026-04-25");
    expect(out).toContain("2026-04-26");
    const url = String(vi.mocked(global.fetch).mock.calls[0][0]);
    expect(url).toContain("extensions=all");
  });

  it("hits the cache on repeat call within ttl (no second fetch)", async () => {
    const hangzhouLives = { ...baseLives, lives: [{ ...baseLives.lives[0], city: "杭州市" }] };
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(ok(hangzhouLives));
    const a = await _executeForTest({ city: "杭州", forecast: false });
    const b = await _executeForTest({ city: "杭州", forecast: false });
    expect(a).toBe(b);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("returns lookup-failure message for unknown city without calling fetch", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const out = await _executeForTest({ city: "火星", forecast: false });
    expect(out).toContain("未找到");
    expect(out).toContain("火星");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns fallback when AMap responds with status=0", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      ok({ status: "0", info: "INVALID_USER_KEY", lives: [] })
    );
    const out = await _executeForTest({ city: "上海", forecast: false });
    expect(out).toContain("天气服务暂时不可用");
  });

  it("returns fallback on non-2xx HTTP", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(httpError());
    const out = await _executeForTest({ city: "广州", forecast: false });
    expect(out).toContain("天气服务暂时不可用");
  });

  it("returns fallback on network/abort error", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("aborted"));
    const out = await _executeForTest({ city: "深圳", forecast: false });
    expect(out).toContain("天气服务暂时不可用");
  });

  it("returns fallback on invalid JSON response body", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("<<not json>>", { status: 200, headers: { "content-type": "application/json" } })
    );
    const out = await _executeForTest({ city: "成都", forecast: false });
    expect(out).toContain("天气服务暂时不可用");
  });

  it("returns fallback when status=1 but lives array is empty (base mode)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(ok({ status: "1", info: "OK", lives: [] }));
    const out = await _executeForTest({ city: "南京", forecast: false });
    expect(out).toContain("天气服务暂时不可用");
  });

  it("returns fallback when status=1 but forecasts is missing (forecast mode)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(ok({ status: "1", info: "OK" }));
    const out = await _executeForTest({ city: "天津", forecast: true });
    expect(out).toContain("天气服务暂时不可用");
  });

  it("returns fallback when forecasts is an empty array (forecast mode)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(ok({ status: "1", info: "OK", forecasts: [] }));
    const out = await _executeForTest({ city: "苏州", forecast: true });
    expect(out).toContain("天气服务暂时不可用");
  });

  it("returns fallback when forecasts[0].casts is empty (forecast mode)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      ok({ status: "1", info: "OK", forecasts: [{ city: "重庆市", casts: [] }] })
    );
    const out = await _executeForTest({ city: "重庆", forecast: true });
    expect(out).toContain("天气服务暂时不可用");
  });
});
