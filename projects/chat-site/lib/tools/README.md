# Tools

The chat-site server registers tools here. Each tool is an SDK-agnostic
`ToolSpec` that yields a built `@openai/agents` tool via `toSDKTool()`. The
agent registry references tools by id (`AgentSpec.toolIds`).

## Registered tools

| id | Description |
|---|---|
| `amap-weather` | Current weather (and multi-day forecast) for any Chinese city, via AMap. Cached 10 min per `(adcode, mode)`. Requires `AMAP_API_KEY`. |
| `tavily-search` | Web search with synthesized answer. Cached 30 min per normalized query. Requires `TAVILY_API_KEY`. |

Both tools are wired into the `general` agent (`lib/agents/general.ts`).

## Adding a tool

1. Create `lib/tools/your-tool.ts`. Export a `ToolSpec`:
   ```ts
   import { tool } from "@openai/agents";
   import { z } from "zod";
   import type { ToolSpec } from "./types";

   export const yourTool: ToolSpec = {
     id: "your-tool",
     toSDKTool: () => tool({
       name: "your_tool",
       description: "What it does.",
       parameters: z.object({ /* … */ }),
       execute: async (args) => { /* … */ },
     }),
   };
   ```

2. Register it in `lib/tools/index.ts`:
   ```ts
   import { yourTool } from "./your-tool";

   export const TOOL_REGISTRY: Record<ToolId, ToolSpec> = {
     [yourTool.id]: yourTool,
   };
   ```

3. Reference it from an agent spec by id:
   ```ts
   export const myAgent: AgentSpec = {
     id: "my-agent",
     /* … */,
     toolIds: ["your-tool"],
   };
   ```

The registry is server-only. Tool ids never leak to the browser.
