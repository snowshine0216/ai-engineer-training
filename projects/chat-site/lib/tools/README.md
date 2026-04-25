# Tools

This directory holds a registry scaffold for agent tools. It ships empty — the
v0.3.0 release is about plumbing, not specific tools.

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
   // lib/agents/my-agent.ts
   export const myAgent: AgentSpec = {
     id: "my-agent",
     /* … */,
     toolIds: ["your-tool"],
   };
   ```

The registry is server-only. Tool ids never leak to the browser.
