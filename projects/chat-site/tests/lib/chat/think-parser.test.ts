// tests/lib/chat/think-parser.test.ts
import { describe, it, expect } from "vitest";
import { createThinkParser, type Segment } from "../../../lib/chat/think-parser";

const flatten = (segments: Segment[][]): Segment[] => segments.flat();

const feedAll = (chunks: string[]): Segment[] => {
  const p = createThinkParser();
  const out = chunks.map((c) => p.feed(c));
  out.push(p.flush());
  return flatten(out);
};

describe("createThinkParser", () => {
  it("plain text, no tags → single answer segment", () => {
    expect(feedAll(["hello world"])).toEqual([{ kind: "answer", text: "hello world" }]);
  });

  it("complete <think> block followed by answer", () => {
    expect(feedAll(["<think>reason</think>final"])).toEqual([
      { kind: "thinking", text: "reason" },
      { kind: "answer", text: "final" },
    ]);
  });

  it("tag opens at start of stream", () => {
    expect(feedAll(["<think>only thinking"]).filter((s) => s.text.length > 0)).toEqual([
      { kind: "thinking", text: "only thinking" },
    ]);
  });

  it("only <think> then EOF (no closing tag) → emit as thinking on flush", () => {
    expect(feedAll(["<think>partial reasoning"])).toEqual([
      { kind: "thinking", text: "partial reasoning" },
    ]);
  });

  it("multiple <think> blocks", () => {
    expect(feedAll(["<think>a</think>b<think>c</think>d"])).toEqual([
      { kind: "thinking", text: "a" },
      { kind: "answer", text: "b" },
      { kind: "thinking", text: "c" },
      { kind: "answer", text: "d" },
    ]);
  });

  it("tag split across two chunks: '<th' + 'ink>foo'", () => {
    expect(feedAll(["<th", "ink>foo"])).toEqual([
      { kind: "thinking", text: "foo" },
    ]);
  });

  it("close-tag split across chunks: 'foo</thi' + 'nk>bar' inside <think>", () => {
    expect(feedAll(["<think>foo</thi", "nk>bar"])).toEqual([
      { kind: "thinking", text: "foo" },
      { kind: "answer", text: "bar" },
    ]);
  });

  it("close-tag without prior open-tag → treated as literal answer text", () => {
    expect(feedAll(["just </think> text"])).toEqual([
      { kind: "answer", text: "just </think> text" },
    ]);
  });

  it("byte-by-byte (1-char) slicing of a complete block produces the same segments", () => {
    const full = "<think>r1</think>a1<think>r2</think>a2";
    const chunks = full.split("");
    const result = feedAll(chunks);
    // Concatenating same-kind adjacent segments should equal the canonical form.
    const collapsed: Segment[] = [];
    for (const s of result) {
      const last = collapsed[collapsed.length - 1];
      if (last && last.kind === s.kind) last.text += s.text;
      else collapsed.push({ ...s });
    }
    expect(collapsed).toEqual([
      { kind: "thinking", text: "r1" },
      { kind: "answer", text: "a1" },
      { kind: "thinking", text: "r2" },
      { kind: "answer", text: "a2" },
    ]);
  });

  it("unicode inside thinking", () => {
    expect(feedAll(["<think>π → 中文</think>done"])).toEqual([
      { kind: "thinking", text: "π → 中文" },
      { kind: "answer", text: "done" },
    ]);
  });

  it("empty chunks are no-ops", () => {
    const p = createThinkParser();
    expect(p.feed("")).toEqual([]);
    expect(p.feed("hi")).toEqual([{ kind: "answer", text: "hi" }]);
    expect(p.feed("")).toEqual([]);
    expect(p.flush()).toEqual([]);
  });

  it("flush after fully-resolved stream emits nothing", () => {
    const p = createThinkParser();
    p.feed("<think>x</think>y");
    expect(p.flush()).toEqual([]);
  });

  it("partial-then-disambiguated: '<thi' then 'gger' is plain answer text, not a tag", () => {
    const p = createThinkParser();
    expect(p.feed("<thi")).toEqual([]);          // held — could be "<think>"
    expect(p.feed("gger")).toEqual([{ kind: "answer", text: "<thigger" }]);
  });

  it("aggregate text invariant: across any chunking, the concatenation of segments == the original text minus tag literals", () => {
    const cases: Array<{ input: string; thinking: string; answer: string }> = [
      { input: "plain", thinking: "", answer: "plain" },
      { input: "<think>r</think>a", thinking: "r", answer: "a" },
      { input: "pre<think>r</think>post", thinking: "r", answer: "prepost" },
      { input: "<think>a</think>b<think>c</think>d", thinking: "ac", answer: "bd" },
      { input: "<think>partial only", thinking: "partial only", answer: "" },
    ];
    for (const { input, thinking, answer } of cases) {
      const p = createThinkParser();
      const out: Segment[] = [];
      for (const ch of input) out.push(...p.feed(ch));
      out.push(...p.flush());
      expect(out.filter((s) => s.kind === "thinking").map((s) => s.text).join("")).toBe(thinking);
      expect(out.filter((s) => s.kind === "answer").map((s) => s.text).join("")).toBe(answer);
    }
  });
});
