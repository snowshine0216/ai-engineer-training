// lib/logging/index.ts
import * as fs from "fs";
import * as path from "path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LoggerOptions = {
  level: LogLevel;
  dir: string;
  fileEnabled: boolean;
};

export type Logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
};

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const consoleFor = (level: LogLevel): ((...args: unknown[]) => void) => {
  if (level === "warn") return console.warn;
  if (level === "error") return console.error;
  return console.log;
};

export const createLogger = (opts: LoggerOptions): Logger => {
  const minLevel = LEVEL_ORDER[opts.level];
  const filePath = path.join(opts.dir, "app.log");
  let fileBroken = false;

  const writeFile = (line: string): void => {
    if (!opts.fileEnabled || fileBroken) return;
    try {
      fs.mkdirSync(opts.dir, { recursive: true });
      fs.appendFileSync(filePath, line);
    } catch (err) {
      fileBroken = true;
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[logger] file logging disabled — ${reason}`);
    }
  };

  const log = (level: LogLevel, msg: string, meta?: Record<string, unknown>): void => {
    if (LEVEL_ORDER[level] < minLevel) return;
    const entry = { ts: Date.now(), level, msg, ...(meta ?? {}) };
    const line = JSON.stringify(entry) + "\n";
    consoleFor(level)(line.trimEnd());
    writeFile(line);
  };

  return {
    debug: (msg, meta) => log("debug", msg, meta),
    info:  (msg, meta) => log("info",  msg, meta),
    warn:  (msg, meta) => log("warn",  msg, meta),
    error: (msg, meta) => log("error", msg, meta),
  };
};

// Process-wide default logger. Lazily initialized from env on first access via getLogger().
let _default: Logger | undefined;

export const getLogger = (): Logger => {
  if (_default) return _default;
  const level = (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info";
  const dir = process.env.LOG_DIR ?? "logs";
  const fileEnabled =
    process.env.LOG_FILE_ENABLED !== undefined
      ? process.env.LOG_FILE_ENABLED === "true" || process.env.LOG_FILE_ENABLED === "1"
      : process.env.VERCEL !== "1";
  _default = createLogger({ level, dir, fileEnabled });
  return _default;
};

/** @internal — test helper only */
export const _resetDefaultLogger = (): void => {
  _default = undefined;
};
