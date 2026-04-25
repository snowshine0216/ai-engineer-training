// lib/tools/amap-weather.ts
import { tool } from "@openai/agents";
import { z } from "zod";

import type { ToolSpec } from "./types";
import { lookupAdcode } from "./city-lookup";
import { createTtlCache } from "../cache/ttl-cache";
import { getLogger } from "../logging";

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const TIMEOUT_MS = 10_000;
const ENDPOINT = "https://restapi.amap.com/v3/weather/weatherInfo";
const FALLBACK = "天气服务暂时不可用，请稍后再试。";

const cache = createTtlCache<string>();

type Lives = {
  province: string; city: string; weather: string; temperature: string;
  winddirection: string; windpower: string; humidity: string; reporttime: string;
};

type Cast = {
  date: string; week: string;
  dayweather: string; nightweather: string;
  daytemp: string; nighttemp: string;
  daywind: string; nightwind: string;
  daypower: string; nightpower: string;
};

const formatLives = (l: Lives): string =>
  [
    `📍 ${l.province} ${l.city}`,
    `🌡️ 温度: ${l.temperature}°C`,
    `🌤️ 天气: ${l.weather}`,
    `💨 风向: ${l.winddirection} ${l.windpower}`,
    `💧 湿度: ${l.humidity}%`,
    `🕒 发布: ${l.reporttime}`,
  ].join("\n");

const formatCast = (c: Cast): string =>
  `${c.date} (周${c.week}) 白天 ${c.dayweather} ${c.daytemp}°C / 夜间 ${c.nightweather} ${c.nighttemp}°C, 风 ${c.daywind} ${c.daypower}`;

const formatForecast = (city: string, casts: Cast[]): string =>
  [`📍 ${city} — 多日预报`, ...casts.map(formatCast)].join("\n");

const fetchWithTimeout = async (url: string): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

type ExecuteArgs = { city: string; forecast?: boolean };

const executeImpl = async ({ city, forecast = false }: ExecuteArgs): Promise<string> => {
  const logger = getLogger();
  const match = lookupAdcode(city);
  if (!match) {
    logger.info("amap-weather miss-city", { city });
    return `未找到 '${city}' 的城市编码，请尝试更具体的中国城市名（例如：北京、上海、深圳）。`;
  }

  const cacheKey = `weather:${match.adcode}:${forecast ? "all" : "base"}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info("amap-weather call", { city, adcode: match.adcode, forecast, cacheHit: true });
    return cached;
  }

  const apiKey = process.env.AMAP_API_KEY ?? "";
  const ext = forecast ? "all" : "base";
  const url = `${ENDPOINT}?key=${encodeURIComponent(apiKey)}&city=${match.adcode}&extensions=${ext}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(url);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn("amap-weather failed", { city, adcode: match.adcode, forecast, reason });
    return FALLBACK;
  }

  if (!res.ok) {
    logger.warn("amap-weather failed", { city, adcode: match.adcode, forecast, status: res.status });
    return FALLBACK;
  }

  const data = (await res.json()) as {
    status?: string; info?: string;
    lives?: Lives[];
    forecasts?: Array<{ city: string; casts: Cast[] }>;
  };

  if (data.status !== "1") {
    logger.warn("amap-weather failed", { city, adcode: match.adcode, forecast, info: data.info });
    return FALLBACK;
  }

  let formatted: string;
  if (forecast) {
    const fc = data.forecasts?.[0];
    if (!fc || !fc.casts?.length) return FALLBACK;
    formatted = formatForecast(fc.city, fc.casts);
  } else {
    const live = data.lives?.[0];
    if (!live) return FALLBACK;
    formatted = formatLives(live);
  }

  cache.set(cacheKey, formatted, TTL_MS);
  logger.info("amap-weather call", { city, adcode: match.adcode, forecast, cacheHit: false });
  return formatted;
};

export const _executeForTest = executeImpl;

export const amapWeather: ToolSpec = {
  id: "amap-weather",
  toSDKTool: () =>
    tool({
      name: "amap_weather",
      description:
        "查询中国城市的天气。Look up current weather (or multi-day forecast) for a Chinese city by name.",
      parameters: z.object({
        city: z.string().describe("Chinese city name, e.g. 北京, 上海, 深圳"),
        forecast: z
          .boolean()
          .optional()
          .describe("If true, return multi-day forecast (today + ~3 days); default false."),
      }),
      execute: executeImpl,
    }),
};
