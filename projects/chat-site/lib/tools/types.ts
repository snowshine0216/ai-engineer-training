// lib/tools/types.ts
import type { tool as sdkTool } from "@openai/agents";

// String-literal union of every tool id that exists in TOOL_REGISTRY.
// Adding a new tool: extend this union and add the entry in lib/tools/index.ts.
// A typo in an agent's `toolIds` then becomes a TypeScript error, not a runtime null.
export type ToolId = "amap-weather" | "tavily-search";

// SDK's `tool()` factory return type — opaque to us.
export type SDKTool = ReturnType<typeof sdkTool>;

export type ToolSpec = {
  id: ToolId;
  toSDKTool: () => SDKTool;
};
