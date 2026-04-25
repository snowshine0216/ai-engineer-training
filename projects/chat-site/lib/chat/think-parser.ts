// lib/chat/think-parser.ts
export type Segment = { kind: "thinking" | "answer"; text: string };

export type ThinkParser = {
  feed: (chunk: string) => Segment[];
  flush: () => Segment[];
};

const OPEN = "<think>";
const CLOSE = "</think>";

// Returns the largest n such that buf.slice(-n) === target.slice(0, n) and n > 0,
// or 0 if no non-trivial prefix-of-target ends the buffer.
const trailingPartialMatch = (buf: string, target: string): number => {
  const max = Math.min(buf.length, target.length - 1);
  for (let n = max; n > 0; n--) {
    if (buf.endsWith(target.slice(0, n))) return n;
  }
  return 0;
};

export const createThinkParser = (): ThinkParser => {
  let mode: "outside" | "inside" = "outside";
  let pending = "";

  const segmentKind = (): "answer" | "thinking" =>
    mode === "outside" ? "answer" : "thinking";

  const consume = (chunk: string): Segment[] => {
    pending += chunk;
    const out: Segment[] = [];

    while (pending.length > 0) {
      const target = mode === "outside" ? OPEN : CLOSE;
      const idx = pending.indexOf(target);

      if (idx >= 0) {
        if (idx > 0) out.push({ kind: segmentKind(), text: pending.slice(0, idx) });
        pending = pending.slice(idx + target.length);
        mode = mode === "outside" ? "inside" : "outside";
        continue;
      }

      const partial = trailingPartialMatch(pending, target);
      const emitLen = pending.length - partial;
      if (emitLen > 0) out.push({ kind: segmentKind(), text: pending.slice(0, emitLen) });
      pending = pending.slice(emitLen);
      break;
    }

    return out;
  };

  const flush = (): Segment[] => {
    if (pending.length === 0) return [];
    const out = [{ kind: segmentKind(), text: pending }];
    pending = "";
    return out;
  };

  return { feed: consume, flush };
};
