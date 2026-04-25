// lib/prompts/index.ts
import type { PromptId, PromptSpec } from "./types";
import { general } from "./general";
import { qaCoach } from "./qa-coach";

export type { PromptId, PromptSpec } from "./types";

export const PROMPT_REGISTRY: Record<PromptId, PromptSpec> = {
  [general.id]: general,
  [qaCoach.id]: qaCoach,
};

export const getPrompt = (id: PromptId): PromptSpec | undefined => PROMPT_REGISTRY[id];

export const listPrompts = (): PromptSpec[] => Object.values(PROMPT_REGISTRY);
