// lib/tools/index.ts
import type { SDKTool, ToolId, ToolSpec } from "./types";
import { amapWeather } from "./amap-weather";
import { tavilySearch } from "./tavily-search";

export type { SDKTool, ToolId, ToolSpec } from "./types";

export const TOOL_REGISTRY: Record<ToolId, ToolSpec> = {
  [amapWeather.id]: amapWeather,
  [tavilySearch.id]: tavilySearch,
};

export const getTool = (id: ToolId): ToolSpec | undefined => TOOL_REGISTRY[id];

export const listTools = (): ToolSpec[] => Object.values(TOOL_REGISTRY);

export const toSDKTool = (id: ToolId): SDKTool | null => {
  const spec = getTool(id);
  return spec ? spec.toSDKTool() : null;
};
