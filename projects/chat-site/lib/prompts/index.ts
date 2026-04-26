// lib/prompts/index.ts
import type { PromptId, PromptSpec } from "./types";
import { general } from "./general";
import { qaCoach } from "./qa-coach";
import { customerServiceManager, customerServiceOrder, customerServiceLogistics, customerServiceReply } from "./customer-service";

export type { PromptId, PromptSpec } from "./types";

export const PROMPT_REGISTRY: Record<PromptId, PromptSpec> = {
  [general.id]: general,
  [qaCoach.id]: qaCoach,
  [customerServiceManager.id]: customerServiceManager,
  [customerServiceOrder.id]: customerServiceOrder,
  [customerServiceLogistics.id]: customerServiceLogistics,
  [customerServiceReply.id]: customerServiceReply,
};

export const getPrompt = (id: PromptId): PromptSpec | undefined => PROMPT_REGISTRY[id];

export const listPrompts = (): PromptSpec[] => Object.values(PROMPT_REGISTRY);
