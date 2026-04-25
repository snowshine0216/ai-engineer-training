// lib/chat/page-reducer.ts
import type { ConversationMessage } from "./history";
import type { StreamEvent } from "./stream-event";
import type { PublicAgent } from "../agents/public";

export type AssistantMessage = ConversationMessage & {
  role: "assistant";
  agentId?: string;
  error?: string;
};

export type UiMessage =
  | { role: "user"; content: string }
  | AssistantMessage;

export type PageStatus = "idle" | "running" | "done" | "failed";

export type PageState = {
  agents: PublicAgent[];
  agentId: string | null;
  pickerLocked: boolean;
  messages: UiMessage[];
  status: PageStatus;
  retrying: boolean;
  draft: string;
  thinkingStartedAt: number | null;
  thinkingDurationMs: number | null;
};

export type Action =
  | { type: "SET_AGENTS"; agents: PublicAgent[] }
  | { type: "SELECT_AGENT"; agentId: string }
  | { type: "SET_DRAFT"; value: string }
  | { type: "SUBMIT"; prompt: string }
  | { type: "STREAM_EVENT"; event: StreamEvent }
  | { type: "RETRY" }
  | { type: "NEW_CHAT" };

export const initialState: PageState = {
  agents: [],
  agentId: null,
  pickerLocked: false,
  messages: [],
  status: "idle",
  retrying: false,
  draft: "",
  thinkingStartedAt: null,
  thinkingDurationMs: null,
};

const updateLastAssistant = (
  messages: UiMessage[],
  patch: (m: AssistantMessage) => AssistantMessage,
): UiMessage[] => {
  const idx = messages.length - 1;
  if (idx < 0) return messages;
  const last = messages[idx];
  if (last.role !== "assistant") return messages;
  return [...messages.slice(0, idx), patch(last)];
};

const handleStreamEvent = (state: PageState, event: StreamEvent): PageState => {
  switch (event.kind) {
    case "accepted":
      return {
        ...state,
        messages: updateLastAssistant(state.messages, (m) => ({ ...m, agentId: event.agentId })),
      };
    case "thinking_delta": {
      const startedAt = state.thinkingStartedAt ?? event.ts;
      return {
        ...state,
        thinkingStartedAt: startedAt,
        messages: updateLastAssistant(state.messages, (m) => ({
          ...m,
          thinking: (m.thinking ?? "") + event.delta,
        })),
      };
    }
    case "answer_delta": {
      const isFirstAnswer = state.thinkingDurationMs === null && state.thinkingStartedAt !== null;
      const thinkingDurationMs = isFirstAnswer ? event.ts - (state.thinkingStartedAt as number) : state.thinkingDurationMs;
      return {
        ...state,
        thinkingDurationMs,
        messages: updateLastAssistant(state.messages, (m) => ({
          ...m,
          content: m.content + event.delta,
        })),
      };
    }
    case "retrying":
      return { ...state, retrying: true };
    case "recovered":
      return { ...state, retrying: false };
    case "done":
      return { ...state, status: "done", retrying: false };
    case "failed":
      return {
        ...state,
        status: "failed",
        retrying: false,
        messages: updateLastAssistant(state.messages, (m) => ({ ...m, error: event.message })),
      };
  }
};

export const reducer = (state: PageState, action: Action): PageState => {
  switch (action.type) {
    case "SET_AGENTS":
      return { ...state, agents: action.agents };
    case "SELECT_AGENT":
      if (state.pickerLocked) return state;
      return { ...state, agentId: action.agentId };
    case "SET_DRAFT":
      return { ...state, draft: action.value };
    case "SUBMIT":
      return {
        ...state,
        messages: [
          ...state.messages,
          { role: "user", content: action.prompt },
          { role: "assistant", content: "", thinking: "" },
        ],
        pickerLocked: true,
        status: "running",
        draft: "",
        thinkingStartedAt: null,
        thinkingDurationMs: null,
      };
    case "STREAM_EVENT":
      return handleStreamEvent(state, action.event);
    case "RETRY":
      return {
        ...state,
        status: "running",
        retrying: false,
        thinkingStartedAt: null,
        thinkingDurationMs: null,
        messages: updateLastAssistant(state.messages, () => ({
          role: "assistant",
          content: "",
          thinking: "",
        })),
      };
    case "NEW_CHAT":
      return {
        ...initialState,
        agents: state.agents,
        agentId: state.agentId,
      };
  }
};
