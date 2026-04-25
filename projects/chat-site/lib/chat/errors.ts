// lib/chat/errors.ts
export type ErrorClassification = {
  retryable: boolean;
  reason: string;
  code?: string;
};

export const classifyError = (err: unknown): ErrorClassification => {
  if (!(err instanceof Error)) return { retryable: false, reason: "Unknown error" };

  const msg = err.message.toLowerCase();
  const status = "status" in err && typeof (err as { status: unknown }).status === "number"
    ? (err as { status: number }).status
    : undefined;

  if (status === 429 || msg.includes("rate limit") || msg.includes("429")) {
    return { retryable: true, reason: "Provider throttled. Retrying.", code: "rate_limit_exceeded" };
  }
  if (msg.includes("500") || msg.includes("503") || msg.includes("server error")) {
    return { retryable: true, reason: "Provider unavailable. Retrying.", code: "server_error" };
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return { retryable: true, reason: "Request timed out. Retrying.", code: "timeout" };
  }
  if (msg.includes("connection") || msg.includes("network")) {
    return { retryable: true, reason: "Connection error. Retrying.", code: "connection_error" };
  }
  if (status === 401 || status === 403) {
    return { retryable: false, reason: "API authentication failed. Check your API key.", code: "auth_error" };
  }
  if (status === 404) {
    return { retryable: false, reason: "Model or API endpoint not found.", code: "not_found" };
  }
  return { retryable: false, reason: err.message || "An unexpected error occurred." };
};
