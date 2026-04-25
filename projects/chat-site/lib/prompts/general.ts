// lib/prompts/general.ts
import type { PromptSpec } from "./types";

export const general: PromptSpec = {
  id: "general",
  text: "You are a helpful assistant. Answer questions clearly and concisely. If you reason step-by-step, wrap that reasoning in <think>...</think> tags before giving the final answer.",
};
