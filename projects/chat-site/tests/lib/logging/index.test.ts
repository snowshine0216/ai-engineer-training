// tests/lib/logging/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { createLogger } from "../../../lib/logging";

let tmpDir: string;
let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-site-log-"));
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const readLogLines = (dir: string): unknown[] =>
  fs
    .readFileSync(path.join(dir, "app.log"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

describe("createLogger", () => {
  it("writes one JSON line per call to app.log with ts, level, msg, and meta", () => {
    const logger = createLogger({ level: "info", dir: tmpDir, fileEnabled: true });
    logger.info("hello", { attemptId: 2 });
    const lines = readLogLines(tmpDir);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: "info", msg: "hello", attemptId: 2 });
    expect(typeof (lines[0] as { ts: number }).ts).toBe("number");
  });

  it("filters by level — debug() is dropped when level=info", () => {
    const logger = createLogger({ level: "info", dir: tmpDir, fileEnabled: true });
    logger.debug("verbose");
    expect(fs.existsSync(path.join(tmpDir, "app.log"))).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("emits debug when level=debug", () => {
    const logger = createLogger({ level: "debug", dir: tmpDir, fileEnabled: true });
    logger.debug("verbose", { url: "https://x" });
    const lines = readLogLines(tmpDir);
    expect(lines[0]).toMatchObject({ level: "debug", msg: "verbose", url: "https://x" });
  });

  it("routes by level: info→console.log, warn→console.warn, error→console.error", () => {
    const logger = createLogger({ level: "debug", dir: tmpDir, fileEnabled: false });
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("creates the log directory if it does not exist (idempotent)", () => {
    const nested = path.join(tmpDir, "a", "b", "c");
    const logger = createLogger({ level: "info", dir: nested, fileEnabled: true });
    logger.info("x");
    logger.info("y");
    expect(fs.existsSync(nested)).toBe(true);
    expect(readLogLines(nested)).toHaveLength(2);
  });

  it("disables file writes after a single failure and reports it once via console.error", () => {
    // Point the logger at a path it cannot write to: a regular file used as a "directory"
    const blocker = path.join(tmpDir, "blocker");
    fs.writeFileSync(blocker, "x");
    const logger = createLogger({ level: "info", dir: blocker, fileEnabled: true });
    logger.info("first");
    logger.info("second");
    logger.info("third");
    // Every console.log still happens (3 lines)
    expect(logSpy).toHaveBeenCalledTimes(3);
    // console.error was used exactly once to report the file-write failure
    const fileFailureCalls = errorSpy.mock.calls.filter(([msg]) => typeof msg === "string" && msg.includes("file logging disabled"));
    expect(fileFailureCalls).toHaveLength(1);
  });

  it("skips file writes entirely when fileEnabled=false", () => {
    const logger = createLogger({ level: "info", dir: tmpDir, fileEnabled: false });
    logger.info("x");
    expect(fs.existsSync(path.join(tmpDir, "app.log"))).toBe(false);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
