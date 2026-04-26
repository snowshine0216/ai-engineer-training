// lib/tools/index.ts
import type { SDKTool, ToolId, ToolSpec } from "./types";
import { amapWeather } from "./amap-weather";
import { tavilySearch } from "./tavily-search";

export type { SDKTool, ToolId, ToolSpec } from "./types";

// Keys are written as literals so TypeScript verifies coverage of the ToolId union
// at compile time — adding a new ToolId without updating the registry is an error.
export const TOOL_REGISTRY: Record<ToolId, ToolSpec> = {
  "amap-weather": amapWeather,
  "tavily-search": tavilySearch,
};

// Lookup accepts plain string for dynamic callers (HTTP routes, etc.); known
// callers benefit from the narrow ToolId on TOOL_REGISTRY's keys.
export const getTool = (id: string): ToolSpec | undefined =>
  TOOL_REGISTRY[id as ToolId];

export const listTools = (): ToolSpec[] => Object.values(TOOL_REGISTRY);

export const toSDKTool = (id: string): SDKTool | null => {
  const spec = getTool(id);
  return spec ? spec.toSDKTool() : null;
};
