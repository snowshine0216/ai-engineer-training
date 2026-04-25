// lib/tools/types.ts
import type { tool as sdkTool } from "@openai/agents";

export type ToolId = string;

// SDK's `tool()` factory return type — opaque to us.
export type SDKTool = ReturnType<typeof sdkTool>;

export type ToolSpec = {
  id: ToolId;
  toSDKTool: () => SDKTool;
};
