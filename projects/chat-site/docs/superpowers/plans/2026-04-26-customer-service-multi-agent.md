# Customer Service Multi-Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a SQLite-backed customer-service multi-agent workflow that asks for an order number, uses OpenAI Agents SDK agents-as-tools to inspect order and logistics state, and optionally shows an interaction timeline in chat.

**Architecture:** Keep the existing `chat-site` streaming pipeline. Add a `customer-service` agent that dispatches to a custom runner; the runner performs deterministic order-number preflight, builds a SQLite repository, constructs a manager agent plus three specialist agents, and streams answer + trace events. Database effects, retry effects, and UI trace rendering are isolated behind small modules.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, `@openai/agents`, Node 22 `node:sqlite`, Zod.

---

## File Structure

Create:

- `data/customer-service/schema.sql` - SQLite schema for `orders`, `shipments`, and `logistics_events`.
- `data/customer-service/seed.sql` - deterministic demo data used locally and in tests.
- `scripts/seed-customer-service-db.mjs` - creates the SQLite DB from schema + seed SQL.
- `lib/customer-service/order-number.ts` - pure order-number extraction helper.
- `lib/customer-service/repository.ts` - domain types, row mappers, and repository interface.
- `lib/customer-service/sqlite-repository.ts` - Node SQLite implementation of the repository interface.
- `lib/customer-service/retry.ts` - deterministic retry policy and effectful retry executor.
- `lib/customer-service/trace.ts` - app-level trace event builder and logger helper.
- `lib/customer-service/runner.ts` - customer-service run orchestration.
- `lib/agents/customer-service.ts` - public agent spec for registry.
- `lib/agents/customer-service-workflow.ts` - OpenAI Agents SDK manager and specialist builders.
- `lib/prompts/customer-service.ts` - manager, order, logistics, and reply prompts.
- `components/chat/agent-trace.tsx` - compact trace timeline.
- `tests/lib/customer-service/order-number.test.ts`
- `tests/lib/customer-service/repository.test.ts`
- `tests/lib/customer-service/retry.test.ts`
- `tests/lib/customer-service/trace.test.ts`
- `tests/lib/agents/customer-service-workflow.test.ts`
- `tests/app/api/chat/customer-service-route.test.ts`

Modify:

- `lib/config/env.ts` - add `CUSTOMER_SERVICE_DB_PATH` and `SHOW_AGENT_TRACE`.
- `.env.example` - document new env vars.
- `package.json` - add `seed:customer-service-db` script.
- `lib/chat/stream-event.ts` - add `agent_trace`.
- `lib/chat/page-reducer.ts` - store trace events on assistant messages.
- `components/chat/message-bubble.tsx` - render `AgentTrace`.
- `lib/agents/types.ts` - allow `customer-service` prompt/tool-free public spec.
- `lib/agents/index.ts` - register `customer-service`.
- `lib/prompts/types.ts` and `lib/prompts/index.ts` - register customer-service prompts.
- `lib/chat/run-agent.ts` - dispatch `customer-service` to the custom runner; keep default runner unchanged.
- `app/api/chat/route.ts` - pass new env fields through existing `runAgent` options.
- `README.md` - add setup and deployment notes.

Do not modify `AGENTS.md`; it is already dirty and unrelated.

---

### Task 1: Order Number Extraction

**Files:**
- Create: `lib/customer-service/order-number.ts`
- Test: `tests/lib/customer-service/order-number.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/customer-service/order-number.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractOrderNumber } from "../../../lib/customer-service/order-number";

describe("extractOrderNumber", () => {
  it("extracts Chinese order number with spaces", () => {
    expect(extractOrderNumber("我的订单 1001 为什么还没发货？")).toBe("1001");
  });

  it("extracts Chinese order number after 订单号", () => {
    expect(extractOrderNumber("订单号：CS-2026-0007")).toBe("CS-2026-0007");
  });

  it("extracts English order id", () => {
    expect(extractOrderNumber("why has order AB-889 not shipped")).toBe("AB-889");
  });

  it("extracts hash-prefixed order id", () => {
    expect(extractOrderNumber("帮我查一下 #9999 的物流")).toBe("9999");
  });

  it("returns null when no order number is present", () => {
    expect(extractOrderNumber("我的订单为什么还没发货？")).toBeNull();
  });

  it("trims punctuation from the match", () => {
    expect(extractOrderNumber("订单号 1001。")).toBe("1001");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test tests/lib/customer-service/order-number.test.ts
```

Expected: FAIL with an import error for `lib/customer-service/order-number`.

- [ ] **Step 3: Implement the minimal pure helper**

Create `lib/customer-service/order-number.ts`:

```ts
const normalizeMatch = (value: string): string =>
  value.trim().replace(/^[#：:]+/, "").replace(/[。.,，;；!?！？]+$/u, "");

const PATTERNS = [
  /订单号?\s*[：:]?\s*([A-Za-z0-9][A-Za-z0-9-]{2,31})/u,
  /order(?:\s+id)?\s*[#：:]?\s*([A-Za-z0-9][A-Za-z0-9-]{2,31})/iu,
  /#([A-Za-z0-9][A-Za-z0-9-]{2,31})/u,
] as const;

export const extractOrderNumber = (text: string): string | null => {
  const normalizedText = text.trim();
  if (normalizedText.length === 0) return null;

  for (const pattern of PATTERNS) {
    const match = normalizedText.match(pattern);
    if (match?.[1]) return normalizeMatch(match[1]);
  }

  return null;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm test tests/lib/customer-service/order-number.test.ts
```

Expected: PASS for all six tests.

- [ ] **Step 5: Commit**

```bash
git add lib/customer-service/order-number.ts tests/lib/customer-service/order-number.test.ts
git commit -m "feat: extract customer service order numbers"
```

---

### Task 2: SQLite Schema and Seed Script

**Files:**
- Create: `data/customer-service/schema.sql`
- Create: `data/customer-service/seed.sql`
- Create: `scripts/seed-customer-service-db.mjs`
- Modify: `package.json`
- Test command: seed script creates `data/customer-service/customer-service.sqlite`

- [ ] **Step 1: Write the schema**

Create `data/customer-service/schema.sql`:

```sql
PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS logistics_events;
DROP TABLE IF EXISTS shipments;
DROP TABLE IF EXISTS orders;

CREATE TABLE orders (
  order_id TEXT PRIMARY KEY,
  customer_name TEXT,
  status TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  paid_at TEXT,
  promised_ship_by TEXT,
  hold_reason TEXT,
  warehouse TEXT,
  sku_summary TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE shipments (
  order_id TEXT PRIMARY KEY REFERENCES orders(order_id),
  carrier TEXT,
  tracking_number TEXT,
  status TEXT NOT NULL,
  shipped_at TEXT,
  estimated_delivery_at TEXT,
  latest_location TEXT,
  exception_reason TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE logistics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(order_id),
  event_time TEXT NOT NULL,
  event_code TEXT NOT NULL,
  event_label TEXT NOT NULL,
  location TEXT,
  detail TEXT
);

CREATE INDEX idx_logistics_events_order_time
ON logistics_events(order_id, event_time DESC);
```

- [ ] **Step 2: Write deterministic seed data**

Create `data/customer-service/seed.sql`:

```sql
PRAGMA foreign_keys = ON;

INSERT INTO orders (
  order_id,
  customer_name,
  status,
  payment_status,
  paid_at,
  promised_ship_by,
  hold_reason,
  warehouse,
  sku_summary,
  updated_at
) VALUES
  ('1001', '王同学', 'paid_waiting_fulfillment', 'paid', '2026-04-25T09:10:00+08:00', '2026-04-27T18:00:00+08:00', NULL, 'Shanghai-01', 'AI 工程训练营课程包 x1', '2026-04-26T09:30:00+08:00'),
  ('1002', '李同学', 'on_hold', 'paid', '2026-04-24T16:22:00+08:00', '2026-04-26T18:00:00+08:00', '库存调拨中', 'Beijing-02', 'GPU 实验资源包 x1', '2026-04-26T08:00:00+08:00'),
  ('1003', '陈同学', 'shipped', 'paid', '2026-04-23T11:05:00+08:00', '2026-04-24T18:00:00+08:00', NULL, 'Guangzhou-01', 'Agent 开发手册 x1', '2026-04-24T14:20:00+08:00'),
  ('1004', '赵同学', 'logistics_exception', 'paid', '2026-04-22T10:00:00+08:00', '2026-04-23T18:00:00+08:00', NULL, 'Shenzhen-01', '项目实战材料 x1', '2026-04-25T20:10:00+08:00');

INSERT INTO shipments (
  order_id,
  carrier,
  tracking_number,
  status,
  shipped_at,
  estimated_delivery_at,
  latest_location,
  exception_reason,
  updated_at
) VALUES
  ('1001', NULL, NULL, 'not_shipped', NULL, NULL, NULL, NULL, '2026-04-26T09:30:00+08:00'),
  ('1002', NULL, NULL, 'not_shipped', NULL, NULL, NULL, '库存调拨中，暂未出库', '2026-04-26T08:00:00+08:00'),
  ('1003', '顺丰速运', 'SF10030001', 'in_transit', '2026-04-24T14:20:00+08:00', '2026-04-27T18:00:00+08:00', '上海转运中心', NULL, '2026-04-26T07:40:00+08:00'),
  ('1004', '中通快递', 'ZT10040001', 'exception', '2026-04-23T13:00:00+08:00', '2026-04-26T18:00:00+08:00', '深圳分拨中心', '包裹分拣异常，等待人工复核', '2026-04-25T20:10:00+08:00');

INSERT INTO logistics_events (
  order_id,
  event_time,
  event_code,
  event_label,
  location,
  detail
) VALUES
  ('1003', '2026-04-24T14:20:00+08:00', 'picked_up', '已揽收', '广州仓', '快递员已揽收'),
  ('1003', '2026-04-25T09:00:00+08:00', 'departed', '运输中', '广州转运中心', '包裹已发往上海转运中心'),
  ('1003', '2026-04-26T07:40:00+08:00', 'arrived', '到达转运中心', '上海转运中心', '包裹已到达上海转运中心'),
  ('1004', '2026-04-23T13:00:00+08:00', 'picked_up', '已揽收', '深圳仓', '快递员已揽收'),
  ('1004', '2026-04-25T20:10:00+08:00', 'exception', '物流异常', '深圳分拨中心', '包裹分拣异常，等待人工复核');
```

- [ ] **Step 3: Add seed script**

Create `scripts/seed-customer-service-db.mjs`:

```js
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const dbPath = resolve(root, process.env.CUSTOMER_SERVICE_DB_PATH ?? "data/customer-service/customer-service.sqlite");
const schemaPath = resolve(root, "data/customer-service/schema.sql");
const seedPath = resolve(root, "data/customer-service/seed.sql");

mkdirSync(dirname(dbPath), { recursive: true });
rmSync(dbPath, { force: true });

const db = new DatabaseSync(dbPath);
try {
  db.exec(readFileSync(schemaPath, "utf8"));
  db.exec(readFileSync(seedPath, "utf8"));
  const count = db.prepare("SELECT COUNT(*) AS count FROM orders").get();
  console.log(`Seeded ${count.count} orders into ${dbPath}`);
} finally {
  db.close();
}
```

- [ ] **Step 4: Add package script**

Modify `package.json` scripts:

```json
"seed:customer-service-db": "./scripts/with-project-node.sh node scripts/seed-customer-service-db.mjs"
```

Keep existing scripts unchanged.

- [ ] **Step 5: Run seed script**

Run:

```bash
pnpm seed:customer-service-db
```

Expected: command prints `Seeded 4 orders into` followed by the absolute SQLite path.

- [ ] **Step 6: Commit**

```bash
git add data/customer-service/schema.sql data/customer-service/seed.sql scripts/seed-customer-service-db.mjs package.json
git commit -m "feat: add customer service sqlite seed data"
```

---

### Task 3: Repository Interface and SQLite Adapter

**Files:**
- Create: `lib/customer-service/repository.ts`
- Create: `lib/customer-service/sqlite-repository.ts`
- Test: `tests/lib/customer-service/repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Create `tests/lib/customer-service/repository.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteCustomerServiceRepository } from "../../../lib/customer-service/sqlite-repository";

let tempDir = "";
let dbPath = "";

const seedTempDb = () => {
  tempDir = mkdtempSync(join(tmpdir(), "chat-site-cs-"));
  dbPath = join(tempDir, "customer-service.sqlite");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(readFileSync(resolve("data/customer-service/schema.sql"), "utf8"));
    db.exec(readFileSync(resolve("data/customer-service/seed.sql"), "utf8"));
  } finally {
    db.close();
  }
};

describe("sqlite customer service repository", () => {
  beforeEach(() => {
    seedTempDb();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns an existing order record", async () => {
    const repo = createSqliteCustomerServiceRepository(dbPath);
    const order = await repo.findOrderById("1001");
    expect(order).toMatchObject({
      orderId: "1001",
      status: "paid_waiting_fulfillment",
      paymentStatus: "paid",
      warehouse: "Shanghai-01",
    });
    repo.close();
  });

  it("returns null for a missing order", async () => {
    const repo = createSqliteCustomerServiceRepository(dbPath);
    await expect(repo.findOrderById("9999")).resolves.toBeNull();
    repo.close();
  });

  it("returns logistics with latest event first", async () => {
    const repo = createSqliteCustomerServiceRepository(dbPath);
    const logistics = await repo.findLogisticsByOrderId("1003");
    expect(logistics).toMatchObject({
      orderId: "1003",
      shipmentStatus: "in_transit",
      carrier: "顺丰速运",
      trackingNumber: "SF10030001",
    });
    expect(logistics?.events[0]).toMatchObject({
      eventCode: "arrived",
      eventLabel: "到达转运中心",
      location: "上海转运中心",
    });
    repo.close();
  });

  it("returns not-shipped logistics with no events", async () => {
    const repo = createSqliteCustomerServiceRepository(dbPath);
    const logistics = await repo.findLogisticsByOrderId("1001");
    expect(logistics).toMatchObject({
      orderId: "1001",
      shipmentStatus: "not_shipped",
      events: [],
    });
    repo.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test tests/lib/customer-service/repository.test.ts
```

Expected: FAIL with an import error for `sqlite-repository`.

- [ ] **Step 3: Implement repository types and mappers**

Create `lib/customer-service/repository.ts`:

```ts
export type OrderRecord = {
  orderId: string;
  customerName: string | null;
  status: string;
  paymentStatus: string;
  paidAt: string | null;
  promisedShipBy: string | null;
  holdReason: string | null;
  warehouse: string | null;
  skuSummary: string;
  updatedAt: string;
};

export type LogisticsEventRecord = {
  eventTime: string;
  eventCode: string;
  eventLabel: string;
  location: string | null;
  detail: string | null;
};

export type LogisticsRecord = {
  orderId: string;
  shipmentStatus: string;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  estimatedDeliveryAt: string | null;
  latestLocation: string | null;
  exceptionReason: string | null;
  updatedAt: string;
  events: LogisticsEventRecord[];
};

export type CustomerServiceRepository = {
  findOrderById: (orderId: string) => Promise<OrderRecord | null>;
  findLogisticsByOrderId: (orderId: string) => Promise<LogisticsRecord | null>;
  close: () => void;
};

type OrderRow = {
  order_id: string;
  customer_name: string | null;
  status: string;
  payment_status: string;
  paid_at: string | null;
  promised_ship_by: string | null;
  hold_reason: string | null;
  warehouse: string | null;
  sku_summary: string;
  updated_at: string;
};

type ShipmentRow = {
  order_id: string;
  carrier: string | null;
  tracking_number: string | null;
  status: string;
  shipped_at: string | null;
  estimated_delivery_at: string | null;
  latest_location: string | null;
  exception_reason: string | null;
  updated_at: string;
};

type LogisticsEventRow = {
  event_time: string;
  event_code: string;
  event_label: string;
  location: string | null;
  detail: string | null;
};

export const mapOrderRow = (row: OrderRow): OrderRecord => ({
  orderId: row.order_id,
  customerName: row.customer_name,
  status: row.status,
  paymentStatus: row.payment_status,
  paidAt: row.paid_at,
  promisedShipBy: row.promised_ship_by,
  holdReason: row.hold_reason,
  warehouse: row.warehouse,
  skuSummary: row.sku_summary,
  updatedAt: row.updated_at,
});

export const mapLogisticsEventRow = (row: LogisticsEventRow): LogisticsEventRecord => ({
  eventTime: row.event_time,
  eventCode: row.event_code,
  eventLabel: row.event_label,
  location: row.location,
  detail: row.detail,
});

export const mapLogisticsRow = (
  row: ShipmentRow,
  events: LogisticsEventRecord[],
): LogisticsRecord => ({
  orderId: row.order_id,
  shipmentStatus: row.status,
  carrier: row.carrier,
  trackingNumber: row.tracking_number,
  shippedAt: row.shipped_at,
  estimatedDeliveryAt: row.estimated_delivery_at,
  latestLocation: row.latest_location,
  exceptionReason: row.exception_reason,
  updatedAt: row.updated_at,
  events,
});
```

- [ ] **Step 4: Implement SQLite adapter**

Create `lib/customer-service/sqlite-repository.ts`:

```ts
import { DatabaseSync } from "node:sqlite";
import {
  mapLogisticsEventRow,
  mapLogisticsRow,
  mapOrderRow,
  type CustomerServiceRepository,
  type LogisticsEventRecord,
  type LogisticsRecord,
  type OrderRecord,
} from "./repository";

export const createSqliteCustomerServiceRepository = (
  dbPath: string,
): CustomerServiceRepository => {
  const db = new DatabaseSync(dbPath, { readOnly: true });

  const findOrderById = async (orderId: string): Promise<OrderRecord | null> => {
    const row = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(orderId);
    return row ? mapOrderRow(row as Parameters<typeof mapOrderRow>[0]) : null;
  };

  const findLogisticsByOrderId = async (orderId: string): Promise<LogisticsRecord | null> => {
    const shipment = db.prepare("SELECT * FROM shipments WHERE order_id = ?").get(orderId);
    if (!shipment) return null;

    const eventRows = db
      .prepare(
        [
          "SELECT event_time, event_code, event_label, location, detail",
          "FROM logistics_events",
          "WHERE order_id = ?",
          "ORDER BY event_time DESC",
        ].join(" "),
      )
      .all(orderId);

    const events: LogisticsEventRecord[] = eventRows.map((row) =>
      mapLogisticsEventRow(row as Parameters<typeof mapLogisticsEventRow>[0]),
    );

    return mapLogisticsRow(shipment as Parameters<typeof mapLogisticsRow>[0], events);
  };

  return {
    findOrderById,
    findLogisticsByOrderId,
    close: () => db.close(),
  };
};
```

- [ ] **Step 5: Run repository tests**

Run:

```bash
pnpm test tests/lib/customer-service/repository.test.ts
```

Expected: PASS. Node may print an experimental SQLite warning; that warning is acceptable.

- [ ] **Step 6: Commit**

```bash
git add lib/customer-service/repository.ts lib/customer-service/sqlite-repository.ts tests/lib/customer-service/repository.test.ts
git commit -m "feat: add sqlite customer service repository"
```

---

### Task 4: Retry Policy

**Files:**
- Create: `lib/customer-service/retry.ts`
- Test: `tests/lib/customer-service/retry.test.ts`

- [ ] **Step 1: Write failing retry tests**

Create `tests/lib/customer-service/retry.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { classifyCustomerServiceError, createRetryDelays, withRetry } from "../../../lib/customer-service/retry";

describe("customer service retry", () => {
  it("classifies SQLITE_BUSY as retryable", () => {
    const err = Object.assign(new Error("busy"), { code: "SQLITE_BUSY" });
    expect(classifyCustomerServiceError(err)).toEqual({ retryable: true, code: "SQLITE_BUSY", reason: "SQLite is busy" });
  });

  it("classifies order_not_found as non-retryable", () => {
    const err = Object.assign(new Error("missing"), { code: "order_not_found" });
    expect(classifyCustomerServiceError(err)).toEqual({ retryable: false, code: "order_not_found", reason: "Order was not found" });
  });

  it("creates deterministic exponential delays with injected jitter", () => {
    expect(createRetryDelays({ maxAttempts: 3, baseDelayMs: 200, maxDelayMs: 1500, jitterMs: () => 7 })).toEqual([207, 407]);
  });

  it("retries retryable failures and returns the successful value", async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const fn = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error("busy"), { code: "SQLITE_BUSY" }))
      .mockResolvedValueOnce("ok");
    const onRetry = vi.fn();

    await expect(withRetry(fn, { sleep, jitterMs: () => 0, onRetry })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(200);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1, nextDelayMs: 200 }));
  });

  it("does not retry non-retryable failures", async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const err = Object.assign(new Error("missing"), { code: "order_not_found" });
    await expect(withRetry(() => Promise.reject(err), { sleep, jitterMs: () => 0 })).rejects.toBe(err);
    expect(sleep).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test tests/lib/customer-service/retry.test.ts
```

Expected: FAIL with an import error for `retry`.

- [ ] **Step 3: Implement retry helper**

Create `lib/customer-service/retry.ts`:

```ts
export type CustomerServiceRetryClassification = {
  retryable: boolean;
  code: string;
  reason: string;
};

export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: () => number;
};

export type RetryNotice = {
  attempt: number;
  nextDelayMs: number;
  code: string;
  reason: string;
};

const DEFAULT_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 1500,
  jitterMs: () => Math.floor(Math.random() * 101),
};

const getCode = (err: unknown): string =>
  err instanceof Error && "code" in err && typeof (err as { code: unknown }).code === "string"
    ? (err as { code: string }).code
    : "unknown";

export const classifyCustomerServiceError = (err: unknown): CustomerServiceRetryClassification => {
  const code = getCode(err);
  if (code === "SQLITE_BUSY") return { retryable: true, code, reason: "SQLite is busy" };
  if (code === "SQLITE_LOCKED") return { retryable: true, code, reason: "SQLite is locked" };
  if (code === "timeout") return { retryable: true, code, reason: "Lookup timed out" };
  if (code === "order_not_found") return { retryable: false, code, reason: "Order was not found" };
  if (code === "invalid_order_id") return { retryable: false, code, reason: "Order id is invalid" };
  return { retryable: false, code, reason: err instanceof Error ? err.message : "Unknown customer service error" };
};

export const createRetryDelays = (policy: RetryPolicy): number[] =>
  Array.from({ length: Math.max(0, policy.maxAttempts - 1) }, (_, index) =>
    Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** index) + policy.jitterMs(),
  );

export const withRetry = async <T>(
  fn: () => Promise<T>,
  opts: Partial<RetryPolicy> & {
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (notice: RetryNotice) => void;
  } = {},
): Promise<T> => {
  const policy = { ...DEFAULT_POLICY, ...opts };
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const delays = createRetryDelays(policy);

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      const classification = classifyCustomerServiceError(err);
      const delay = delays[attempt - 1];
      if (!classification.retryable || attempt >= policy.maxAttempts || delay === undefined) throw err;

      opts.onRetry?.({
        attempt,
        nextDelayMs: delay,
        code: classification.code,
        reason: classification.reason,
      });
      await sleep(delay);
    }
  }

  return fn();
};
```

- [ ] **Step 4: Run retry tests**

Run:

```bash
pnpm test tests/lib/customer-service/retry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/customer-service/retry.ts tests/lib/customer-service/retry.test.ts
git commit -m "feat: add customer service retry policy"
```

---

### Task 5: Trace Event Type, Reducer Storage, and Timeline UI

**Files:**
- Modify: `lib/chat/stream-event.ts`
- Modify: `lib/chat/page-reducer.ts`
- Create: `lib/customer-service/trace.ts`
- Create: `components/chat/agent-trace.tsx`
- Modify: `components/chat/message-bubble.tsx`
- Test: `tests/lib/customer-service/trace.test.ts`
- Test: `tests/lib/chat/page-reducer.test.ts`

- [ ] **Step 1: Write failing trace normalizer test**

Create `tests/lib/customer-service/trace.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { makeAgentTraceEvent, logAgentTraceEvent } from "../../../lib/customer-service/trace";

describe("customer service trace", () => {
  it("builds whitelisted agent_trace events", () => {
    expect(makeAgentTraceEvent({
      eventId: "evt-1",
      attemptId: 1,
      ts: 10,
      agentId: "order-status-agent",
      phase: "tool_called",
      label: "OrderStatusAgent",
      summary: "查询订单状态",
      metadata: { orderId: "1001", toolName: "get_order_status", attempt: 1, nextDelayMs: 200 },
    })).toEqual({
      eventId: "evt-1",
      kind: "agent_trace",
      attemptId: 1,
      ts: 10,
      agentId: "order-status-agent",
      phase: "tool_called",
      label: "OrderStatusAgent",
      summary: "查询订单状态",
      metadata: { orderId: "1001", toolName: "get_order_status", attempt: 1, nextDelayMs: 200 },
    });
  });

  it("logs trace events without requiring client emission", () => {
    const info = vi.fn();
    logAgentTraceEvent({ info }, makeAgentTraceEvent({
      eventId: "evt-2",
      attemptId: 1,
      ts: 20,
      agentId: "manager",
      phase: "manager_started",
      label: "CustomerServiceManager",
      summary: "开始处理订单 1001",
      metadata: { orderId: "1001" },
    }));
    expect(info).toHaveBeenCalledWith("customer-service agent trace", expect.objectContaining({
      agentId: "manager",
      phase: "manager_started",
      orderId: "1001",
    }));
  });
});
```

- [ ] **Step 2: Add failing reducer test**

Append to `tests/lib/chat/page-reducer.test.ts`:

```ts
  it("STREAM_EVENT agent_trace appends trace entries to the last assistant message", () => {
    const state = apply(
      { ...initialState, agentId: "customer-service" },
      { type: "SUBMIT", prompt: "订单 1001 为什么没发货" },
      { type: "STREAM_EVENT", event: ev({
        kind: "agent_trace",
        agentId: "order-status-agent",
        phase: "tool_called",
        label: "OrderStatusAgent",
        summary: "查询订单状态",
        metadata: { orderId: "1001", toolName: "get_order_status" },
      }, { ts: 10, eventId: "trace-1", attemptId: 1 }) },
    );

    expect(lastAssistant(state).traces).toEqual([
      expect.objectContaining({
        phase: "tool_called",
        summary: "查询订单状态",
      }),
    ]);
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
pnpm test tests/lib/customer-service/trace.test.ts tests/lib/chat/page-reducer.test.ts
```

Expected: FAIL because `agent_trace` and `traces` do not exist yet.

- [ ] **Step 4: Add stream event type**

Modify `lib/chat/stream-event.ts`:

```ts
export type AgentTraceEvent = {
  eventId: string;
  kind: "agent_trace";
  attemptId: number;
  ts: number;
  agentId: string;
  phase:
    | "manager_started"
    | "specialist_started"
    | "tool_called"
    | "retry_scheduled"
    | "tool_succeeded"
    | "tool_failed"
    | "specialist_completed"
    | "manager_completed";
  label: string;
  summary: string;
  metadata?: {
    orderId?: string;
    toolName?: string;
    attempt?: number;
    nextDelayMs?: number;
  };
};
```

Then add `AgentTraceEvent` to the `StreamEvent` union.

- [ ] **Step 5: Add trace helper**

Create `lib/customer-service/trace.ts`:

```ts
import type { AgentTraceEvent } from "../chat/stream-event";

type LoggerLike = {
  info: (message: string, data: Record<string, unknown>) => void;
};

type MakeTraceInput = Omit<AgentTraceEvent, "kind">;

export const makeAgentTraceEvent = (input: MakeTraceInput): AgentTraceEvent => ({
  ...input,
  kind: "agent_trace",
  metadata: input.metadata
    ? {
        ...(input.metadata.orderId ? { orderId: input.metadata.orderId } : {}),
        ...(input.metadata.toolName ? { toolName: input.metadata.toolName } : {}),
        ...(input.metadata.attempt ? { attempt: input.metadata.attempt } : {}),
        ...(input.metadata.nextDelayMs ? { nextDelayMs: input.metadata.nextDelayMs } : {}),
      }
    : undefined,
});

export const logAgentTraceEvent = (logger: LoggerLike, event: AgentTraceEvent): void => {
  logger.info("customer-service agent trace", {
    eventId: event.eventId,
    attemptId: event.attemptId,
    agentId: event.agentId,
    phase: event.phase,
    label: event.label,
    summary: event.summary,
    orderId: event.metadata?.orderId,
    toolName: event.metadata?.toolName,
    attempt: event.metadata?.attempt,
    nextDelayMs: event.metadata?.nextDelayMs,
  });
};
```

- [ ] **Step 6: Store traces in reducer**

Modify `AssistantMessage` in `lib/chat/page-reducer.ts`:

```ts
export type AssistantMessage = ConversationMessage & {
  role: "assistant";
  agentId?: string;
  error?: string;
  traces?: AgentTraceEvent[];
};
```

Import `AgentTraceEvent` from `./stream-event`. Add a case to `handleStreamEvent`:

```ts
    case "agent_trace":
      return {
        ...state,
        messages: updateLastAssistant(state.messages, (m) => ({
          ...m,
          traces: [...(m.traces ?? []), event],
        })),
      };
```

Reset traces on retry with:

```ts
{
  role: "assistant",
  content: "",
  thinking: "",
  traces: [],
}
```

- [ ] **Step 7: Add timeline component**

Create `components/chat/agent-trace.tsx`:

```tsx
import type { AgentTraceEvent } from "@/lib/chat/stream-event";

type Props = {
  traces: AgentTraceEvent[];
};

const phaseLabel = (phase: AgentTraceEvent["phase"]): string => {
  const labels: Record<AgentTraceEvent["phase"], string> = {
    manager_started: "Manager started",
    specialist_started: "Specialist started",
    tool_called: "Tool called",
    retry_scheduled: "Retry scheduled",
    tool_succeeded: "Tool succeeded",
    tool_failed: "Tool failed",
    specialist_completed: "Specialist completed",
    manager_completed: "Manager completed",
  };
  return labels[phase];
};

export function AgentTrace({ traces }: Props) {
  if (traces.length === 0) return null;

  return (
    <details style={{ marginBottom: 10 }}>
      <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 12 }}>
        Agent trace ({traces.length})
      </summary>
      <ol style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>
        {traces.map((trace) => (
          <li key={trace.eventId}>
            <strong>{phaseLabel(trace.phase)}</strong>
            {" · "}
            <span>{trace.label}</span>
            {" · "}
            <span>{trace.summary}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
```

- [ ] **Step 8: Render timeline in message bubble**

Modify `components/chat/message-bubble.tsx`:

```tsx
import { AgentTrace } from "./agent-trace";
```

Render it after `ThinkingBlock` and before answer content:

```tsx
        <AgentTrace traces={message.traces ?? []} />
```

- [ ] **Step 9: Run focused tests**

Run:

```bash
pnpm test tests/lib/customer-service/trace.test.ts tests/lib/chat/page-reducer.test.ts
pnpm typecheck
```

Expected: PASS for tests and typecheck.

- [ ] **Step 10: Commit**

```bash
git add lib/chat/stream-event.ts lib/chat/page-reducer.ts lib/customer-service/trace.ts components/chat/agent-trace.tsx components/chat/message-bubble.tsx tests/lib/customer-service/trace.test.ts tests/lib/chat/page-reducer.test.ts
git commit -m "feat: add customer service trace timeline"
```

---

### Task 6: Environment Contract

**Files:**
- Modify: `lib/config/env.ts`
- Modify: `.env.example`
- Test: `tests/lib/config/env.test.ts`
- Test: `tests/lib/config/env-extra.test.ts`

- [ ] **Step 1: Add failing env tests**

Append to `tests/lib/config/env.test.ts`:

```ts
  it("defaults customer service db path and trace visibility", () => {
    const env = parseServerEnv({
      OPENAI_BASE_URL: "https://api.example.com/v1",
      OPENAI_API_KEY: "sk-test",
      DEFAULT_MODEL: "gpt-4o-mini",
      AMAP_API_KEY: "amap",
      TAVILY_API_KEY: "tavily",
    });

    expect(env.CUSTOMER_SERVICE_DB_PATH).toBe("data/customer-service/customer-service.sqlite");
    expect(env.SHOW_AGENT_TRACE).toBe(true);
  });

  it("parses SHOW_AGENT_TRACE=false", () => {
    const env = parseServerEnv({
      OPENAI_BASE_URL: "https://api.example.com/v1",
      OPENAI_API_KEY: "sk-test",
      DEFAULT_MODEL: "gpt-4o-mini",
      AMAP_API_KEY: "amap",
      TAVILY_API_KEY: "tavily",
      SHOW_AGENT_TRACE: "false",
    });

    expect(env.SHOW_AGENT_TRACE).toBe(false);
  });
```

- [ ] **Step 2: Run env tests to verify failure**

Run:

```bash
pnpm test tests/lib/config/env.test.ts tests/lib/config/env-extra.test.ts
```

Expected: FAIL because the env fields do not exist.

- [ ] **Step 3: Add env fields**

Modify `serverEnvSchema` in `lib/config/env.ts`:

```ts
  CUSTOMER_SERVICE_DB_PATH: optionalNonEmptyString,
  SHOW_AGENT_TRACE: optionalBoolean,
```

Update `ServerEnv`:

```ts
export type ServerEnv = ServerEnvParsed & {
  LOG_DIR: string;
  LOG_FILE_ENABLED: boolean;
  CUSTOMER_SERVICE_DB_PATH: string;
  SHOW_AGENT_TRACE: boolean;
};
```

Update `applyLoggerDefaults`:

```ts
const applyLoggerDefaults = (parsed: ServerEnvParsed, raw: Record<string, string | undefined>): ServerEnv => ({
  ...parsed,
  LOG_DIR: parsed.LOG_DIR ?? "logs",
  LOG_FILE_ENABLED: parsed.LOG_FILE_ENABLED ?? !isVercel(raw),
  CUSTOMER_SERVICE_DB_PATH: parsed.CUSTOMER_SERVICE_DB_PATH ?? "data/customer-service/customer-service.sqlite",
  SHOW_AGENT_TRACE: parsed.SHOW_AGENT_TRACE ?? true,
});
```

- [ ] **Step 4: Update `.env.example`**

Add:

```env
# Customer service multi-agent demo
CUSTOMER_SERVICE_DB_PATH=data/customer-service/customer-service.sqlite
SHOW_AGENT_TRACE=true
```

- [ ] **Step 5: Run env tests**

Run:

```bash
pnpm test tests/lib/config/env.test.ts tests/lib/config/env-extra.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/config/env.ts .env.example tests/lib/config/env.test.ts tests/lib/config/env-extra.test.ts
git commit -m "feat: configure customer service environment"
```

---

### Task 7: Prompts and Agent Registry

**Files:**
- Create: `lib/prompts/customer-service.ts`
- Modify: `lib/prompts/types.ts`
- Modify: `lib/prompts/index.ts`
- Create: `lib/agents/customer-service.ts`
- Modify: `lib/agents/index.ts`
- Test: `tests/lib/agents/registry.test.ts`
- Test: `tests/lib/prompts/index.test.ts`

- [ ] **Step 1: Add failing registry tests**

Update `tests/lib/agents/registry.test.ts`:

```ts
  it("contains customer-service with existing agents", () => {
    const ids = Object.keys(AGENT_REGISTRY).sort();
    expect(ids).toEqual(["customer-service", "general", "qa-coach"]);
  });
```

Update the existing count expectation:

```ts
expect(listAgents()).toHaveLength(3);
```

Add to `tests/lib/prompts/index.test.ts`:

```ts
  it("registers customer service prompts", () => {
    expect(getPrompt("customer-service-manager")?.text).toContain("CustomerServiceManager");
    expect(getPrompt("customer-service-order")?.text).toContain("OrderStatusAgent");
    expect(getPrompt("customer-service-logistics")?.text).toContain("LogisticsAgent");
    expect(getPrompt("customer-service-reply")?.text).toContain("ReplySynthesisAgent");
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm test tests/lib/agents/registry.test.ts tests/lib/prompts/index.test.ts
```

Expected: FAIL because prompts and agent are not registered.

- [ ] **Step 3: Add customer service prompt ids**

Modify `lib/prompts/types.ts`:

```ts
export type PromptId =
  | "general"
  | "qa-coach"
  | "customer-service-manager"
  | "customer-service-order"
  | "customer-service-logistics"
  | "customer-service-reply";
```

Use the existing union shape if the file differs.

- [ ] **Step 4: Create prompts**

Create `lib/prompts/customer-service.ts`:

```ts
import type { PromptSpec } from "./types";

export const customerServiceManager: PromptSpec = {
  id: "customer-service-manager",
  text: [
    "You are CustomerServiceManager.",
    "You handle Chinese customer-service questions about order shipping.",
    "Use the provided order number. Do not ask for an order number because server preflight already handled that.",
    "Call order_status_agent first to understand order state.",
    "Call logistics_agent second to understand logistics state.",
    "Call reply_synthesis_agent with the user question, order number, order summary, and logistics summary.",
    "Return only the final customer-facing Chinese answer.",
    "Do not invent facts not returned by tools.",
  ].join(\"\\n\"),
};

export const customerServiceOrder: PromptSpec = {
  id: "customer-service-order",
  text: [
    "You are OrderStatusAgent.",
    "Your only job is to call get_order_status for the provided order number and summarize the result.",
    "Return compact JSON text with orderId, found, status, paymentStatus, promisedShipBy, holdReason, warehouse, and summary.",
    "Do not answer logistics questions.",
  ].join(\"\\n\"),
};

export const customerServiceLogistics: PromptSpec = {
  id: "customer-service-logistics",
  text: [
    "You are LogisticsAgent.",
    "Your only job is to call get_logistics_info for the provided order number and summarize the result.",
    "Return compact JSON text with orderId, found, shipmentStatus, carrier, trackingNumber, latestEvent, exceptionReason, and summary.",
    "Do not answer payment or warehouse questions except when the logistics data includes them.",
  ].join(\"\\n\"),
};

export const customerServiceReply: PromptSpec = {
  id: "customer-service-reply",
  text: [
    "You are ReplySynthesisAgent.",
    "Turn the manager-provided order and logistics summaries into one concise Chinese customer-service answer.",
    "Explain why the order has not shipped.",
    "Include the next step and expected timing when available.",
    "Apologize only when there is a service issue or delay.",
    "Do not expose raw database fields unless they are useful to the customer.",
  ].join(\"\\n\"),
};

export const customerServicePrompts = [
  customerServiceManager,
  customerServiceOrder,
  customerServiceLogistics,
  customerServiceReply,
];
```

- [ ] **Step 5: Register prompts**

Modify `lib/prompts/index.ts` to include:

```ts
import { customerServicePrompts } from "./customer-service";
```

Add entries to the prompt registry using the existing pattern:

```ts
for (const prompt of customerServicePrompts) {
  PROMPT_REGISTRY[prompt.id] = prompt;
}
```

If the current registry is a literal object, add:

```ts
[customerServiceManager.id]: customerServiceManager,
[customerServiceOrder.id]: customerServiceOrder,
[customerServiceLogistics.id]: customerServiceLogistics,
[customerServiceReply.id]: customerServiceReply,
```

- [ ] **Step 6: Add public agent spec**

Create `lib/agents/customer-service.ts`:

```ts
import type { AgentSpec } from "./types";

export const customerService: AgentSpec = {
  id: "customer-service",
  name: "Customer Service",
  description: "Multi-agent order shipping support with SQLite order and logistics lookup.",
  promptId: "customer-service-manager",
  toolIds: [],
};
```

Modify `lib/agents/index.ts`:

```ts
import { customerService } from "./customer-service";
```

Add to `AGENT_REGISTRY`:

```ts
[customerService.id]: customerService,
```

- [ ] **Step 7: Run registry tests**

Run:

```bash
pnpm test tests/lib/agents/registry.test.ts tests/lib/prompts/index.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/prompts/customer-service.ts lib/prompts/types.ts lib/prompts/index.ts lib/agents/customer-service.ts lib/agents/index.ts tests/lib/agents/registry.test.ts tests/lib/prompts/index.test.ts
git commit -m "feat: register customer service agent prompts"
```

---

### Task 8: OpenAI Agents SDK Workflow Builders

**Files:**
- Create: `lib/agents/customer-service-workflow.ts`
- Test: `tests/lib/agents/customer-service-workflow.test.ts`

- [ ] **Step 1: Write failing SDK wiring tests**

Create `tests/lib/agents/customer-service-workflow.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@openai/agents", () => ({
  Agent: vi.fn().mockImplementation((opts: unknown) => ({ __agent: opts, asTool: vi.fn((toolOpts: unknown) => ({ __agentTool: toolOpts })) })),
  tool: vi.fn().mockImplementation((opts: unknown) => ({ __sdkTool: opts })),
}));

import { buildCustomerServiceWorkflow } from "../../../lib/agents/customer-service-workflow";

const repo = {
  findOrderById: vi.fn(),
  findLogisticsByOrderId: vi.fn(),
  close: vi.fn(),
};

describe("customer service workflow builders", () => {
  it("builds manager with three specialist agent tools", () => {
    const workflow = buildCustomerServiceWorkflow({
      model: "gpt-4o-mini",
      repository: repo,
      emitTrace: vi.fn(),
    });

    expect(workflow.manager.__agent.name).toBe("CustomerServiceManager");
    expect(workflow.manager.__agent.tools).toHaveLength(3);
    expect(workflow.orderAgent.__agent.tools).toHaveLength(1);
    expect(workflow.logisticsAgent.__agent.tools).toHaveLength(1);
    expect(workflow.replyAgent.__agent.tools).toHaveLength(0);
  });

  it("uses stable tool names for specialist agents", () => {
    const workflow = buildCustomerServiceWorkflow({
      model: "gpt-4o-mini",
      repository: repo,
      emitTrace: vi.fn(),
    });

    const toolNames = workflow.manager.__agent.tools.map((tool: { __agentTool: { toolName: string } }) => tool.__agentTool.toolName);
    expect(toolNames).toEqual(["order_status_agent", "logistics_agent", "reply_synthesis_agent"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test tests/lib/agents/customer-service-workflow.test.ts
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement SDK builders**

Create `lib/agents/customer-service-workflow.ts`:

```ts
import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import {
  customerServiceLogistics,
  customerServiceManager,
  customerServiceOrder,
  customerServiceReply,
} from "../prompts/customer-service";
import { withRetry } from "../customer-service/retry";
import type { AgentTraceEvent } from "../chat/stream-event";
import type { CustomerServiceRepository } from "../customer-service/repository";

type WorkflowOptions = {
  model: string;
  repository: CustomerServiceRepository;
  emitTrace: (event: Omit<AgentTraceEvent, "eventId" | "kind" | "attemptId" | "ts">) => void;
};

const summarizeOrder = async (repository: CustomerServiceRepository, orderId: string): Promise<string> => {
  const order = await withRetry(() => repository.findOrderById(orderId));
  if (!order) return JSON.stringify({ orderId, found: false, summary: "未找到该订单。" });
  return JSON.stringify({
    orderId: order.orderId,
    found: true,
    status: order.status,
    paymentStatus: order.paymentStatus,
    promisedShipBy: order.promisedShipBy,
    holdReason: order.holdReason,
    warehouse: order.warehouse,
    summary: order.holdReason
      ? `订单状态为 ${order.status}，原因：${order.holdReason}。`
      : `订单状态为 ${order.status}，仓库：${order.warehouse ?? "未记录"}。`,
  });
};

const summarizeLogistics = async (repository: CustomerServiceRepository, orderId: string): Promise<string> => {
  const logistics = await withRetry(() => repository.findLogisticsByOrderId(orderId));
  if (!logistics) return JSON.stringify({ orderId, found: false, summary: "暂未查询到物流记录。" });
  return JSON.stringify({
    orderId: logistics.orderId,
    found: true,
    shipmentStatus: logistics.shipmentStatus,
    carrier: logistics.carrier,
    trackingNumber: logistics.trackingNumber,
    latestEvent: logistics.events[0] ?? null,
    exceptionReason: logistics.exceptionReason,
    summary: logistics.exceptionReason
      ? `物流状态为 ${logistics.shipmentStatus}，异常原因：${logistics.exceptionReason}。`
      : `物流状态为 ${logistics.shipmentStatus}。`,
  });
};

export const buildCustomerServiceWorkflow = ({ model, repository, emitTrace }: WorkflowOptions) => {
  const getOrderStatus = tool({
    name: "get_order_status",
    description: "Look up order status by order id from the customer service database.",
    parameters: z.object({ orderId: z.string().min(1) }),
    execute: async ({ orderId }) => {
      emitTrace({
        agentId: "order-status-agent",
        phase: "tool_called",
        label: "OrderStatusAgent",
        summary: "查询订单状态",
        metadata: { orderId, toolName: "get_order_status" },
      });
      return summarizeOrder(repository, orderId);
    },
  });

  const getLogisticsInfo = tool({
    name: "get_logistics_info",
    description: "Look up logistics status by order id from the customer service database.",
    parameters: z.object({ orderId: z.string().min(1) }),
    execute: async ({ orderId }) => {
      emitTrace({
        agentId: "logistics-agent",
        phase: "tool_called",
        label: "LogisticsAgent",
        summary: "查询物流状态",
        metadata: { orderId, toolName: "get_logistics_info" },
      });
      return summarizeLogistics(repository, orderId);
    },
  });

  const orderAgent = new Agent({
    name: "OrderStatusAgent",
    instructions: customerServiceOrder.text,
    model,
    tools: [getOrderStatus],
  });

  const logisticsAgent = new Agent({
    name: "LogisticsAgent",
    instructions: customerServiceLogistics.text,
    model,
    tools: [getLogisticsInfo],
  });

  const replyAgent = new Agent({
    name: "ReplySynthesisAgent",
    instructions: customerServiceReply.text,
    model,
    tools: [],
  });

  const manager = new Agent({
    name: "CustomerServiceManager",
    instructions: customerServiceManager.text,
    model,
    tools: [
      orderAgent.asTool({ toolName: "order_status_agent", toolDescription: "Check order payment, hold, and fulfillment status." }),
      logisticsAgent.asTool({ toolName: "logistics_agent", toolDescription: "Check shipment, tracking, and logistics exception status." }),
      replyAgent.asTool({ toolName: "reply_synthesis_agent", toolDescription: "Compose the final Chinese customer-service answer." }),
    ],
  });

  return { manager, orderAgent, logisticsAgent, replyAgent };
};
```

- [ ] **Step 4: Run SDK wiring tests**

Run:

```bash
pnpm test tests/lib/agents/customer-service-workflow.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/agents/customer-service-workflow.ts tests/lib/agents/customer-service-workflow.test.ts
git commit -m "feat: build customer service agent workflow"
```

---

### Task 9: Customer Service Runner

**Files:**
- Create: `lib/customer-service/runner.ts`
- Modify: `lib/chat/run-agent.ts`
- Test: `tests/lib/chat/run-agent.test.ts`
- Test: `tests/app/api/chat/customer-service-route.test.ts`

- [ ] **Step 1: Write failing runner tests**

Create `tests/app/api/chat/customer-service-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StreamEvent } from "../../../../lib/chat/stream-event";

vi.mock("../../../../lib/config/env", () => ({
  getServerEnv: vi.fn(() => ({
    OPENAI_BASE_URL: "https://api.example.com/v1",
    OPENAI_API_KEY: "sk-test",
    DEFAULT_MODEL: "gpt-4o-mini",
    AMAP_API_KEY: "amap",
    TAVILY_API_KEY: "tavily",
    CUSTOMER_SERVICE_DB_PATH: "data/customer-service/customer-service.sqlite",
    SHOW_AGENT_TRACE: true,
    DEMO_REQUEST_BUDGET: 50,
    LANGFUSE_PUBLIC_KEY: undefined,
    LANGFUSE_SECRET_KEY: undefined,
    LANGFUSE_HOST: undefined,
    LOG_LEVEL: "info",
    LOG_DIR: "logs",
    LOG_FILE_ENABLED: false,
  })),
}));

vi.mock("../../../../lib/ai/openai-provider", () => ({
  initializeOpenAIProvider: vi.fn(),
  validateProviderAuth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../lib/customer-service/runner", () => ({
  runCustomerServiceAgent: vi.fn(),
}));

vi.mock("../../../../lib/telemetry/langfuse", () => ({
  createLangfuseTrace: vi.fn(() => Promise.resolve({ traceId: "t1", traceUrl: null, flush: vi.fn() })),
}));

vi.mock("../../../../lib/logging", () => ({
  getLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { POST } from "../../../../app/api/chat/route";
import { runCustomerServiceAgent } from "../../../../lib/customer-service/runner";
import { resetBudget } from "../../../../lib/chat/budget";

const readStream = async (response: Response): Promise<StreamEvent[]> =>
  (await response.text()).split("\n").filter(Boolean).map((line) => JSON.parse(line) as StreamEvent);

const makeRequest = (content: string) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId: "customer-service", messages: [{ role: "user", content }] }),
  });

describe("POST /api/chat customer-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBudget();
  });

  it("asks for an order number without calling the SDK runner", async () => {
    const resp = await POST(makeRequest("我的订单为什么还没发货？"));
    expect(resp.status).toBe(200);
    const events = await readStream(resp);
    expect(events.map((event) => event.kind)).toEqual(["accepted", "answer_delta", "done"]);
    expect(events[1]).toMatchObject({ kind: "answer_delta", delta: "请提供订单号，我帮你查询发货状态。" });
    expect(runCustomerServiceAgent).not.toHaveBeenCalled();
  });

  it("delegates to the customer service runner when an order number exists", async () => {
    vi.mocked(runCustomerServiceAgent).mockImplementation(async ({ emit }) => {
      emit({ eventId: "1", kind: "accepted", attemptId: 1, agentId: "customer-service", ts: 1 });
      emit({ eventId: "2", kind: "done", attemptId: 1, ts: 2 });
    });

    const resp = await POST(makeRequest("我的订单 1001 为什么还没发货？"));
    expect(resp.status).toBe(200);
    await readStream(resp);
    expect(runCustomerServiceAgent).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "1001",
      env: expect.objectContaining({ SHOW_AGENT_TRACE: true }),
    }));
  });
});
```

- [ ] **Step 2: Run route test to verify it fails**

Run:

```bash
pnpm test tests/app/api/chat/customer-service-route.test.ts
```

Expected: FAIL because the runner module and dispatch path do not exist.

- [ ] **Step 3: Implement customer service runner**

Create `lib/customer-service/runner.ts`:

```ts
import { randomUUID } from "crypto";
import { getRunner } from "../ai/openai-provider";
import { buildCustomerServiceWorkflow } from "../agents/customer-service-workflow";
import { createSqliteCustomerServiceRepository } from "./sqlite-repository";
import { makeAgentTraceEvent, logAgentTraceEvent } from "./trace";
import { toAgentInput, type ConversationMessage } from "../chat/history";
import { createThinkParser } from "../chat/think-parser";
import type { ServerEnv } from "../config/env";
import type { StreamEvent } from "../chat/stream-event";
import { getLogger } from "../logging";

export type RunCustomerServiceAgentOptions = {
  messages: ConversationMessage[];
  orderId: string;
  emit: (event: StreamEvent) => void;
  env: ServerEnv;
  signal?: AbortSignal;
};

const makeEventId = () => randomUUID();

export const runCustomerServiceAgent = async ({
  messages,
  orderId,
  emit,
  env,
  signal,
}: RunCustomerServiceAgentOptions): Promise<void> => {
  const logger = getLogger();
  const repository = createSqliteCustomerServiceRepository(env.CUSTOMER_SERVICE_DB_PATH);
  const parser = createThinkParser();

  const emitTrace = (input: Omit<StreamEvent & { kind: "agent_trace" }, "eventId" | "kind" | "attemptId" | "ts">): void => {
    const event = makeAgentTraceEvent({
      ...input,
      eventId: makeEventId(),
      attemptId: 1,
      ts: Date.now(),
    });
    logAgentTraceEvent(logger, event);
    if (env.SHOW_AGENT_TRACE) emit(event);
  };

  try {
    emit({ eventId: makeEventId(), kind: "accepted", attemptId: 1, agentId: "customer-service", ts: Date.now() });
    emitTrace({
      agentId: "customer-service-manager",
      phase: "manager_started",
      label: "CustomerServiceManager",
      summary: `开始处理订单 ${orderId}`,
      metadata: { orderId },
    });

    const workflow = buildCustomerServiceWorkflow({
      model: env.DEFAULT_MODEL,
      repository,
      emitTrace,
    });

    const runner = getRunner();
    const input = [
      ...toAgentInput(messages),
      {
        role: "user" as const,
        content: `订单号：${orderId}`,
      },
    ];
    const streamed = await runner.run(workflow.manager, input, { stream: true, signal });
    const textStream = streamed.toTextStream({ compatibleWithNodeStreams: true });

    for await (const chunk of textStream) {
      if (signal?.aborted) return;
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : (chunk as string);
      for (const seg of parser.feed(text)) {
        if (seg.text.length === 0) continue;
        emit({
          eventId: makeEventId(),
          kind: seg.kind === "thinking" ? "thinking_delta" : "answer_delta",
          attemptId: 1,
          ts: Date.now(),
          delta: seg.text,
        });
      }
    }

    for (const seg of parser.flush()) {
      if (seg.text.length === 0) continue;
      emit({
        eventId: makeEventId(),
        kind: seg.kind === "thinking" ? "thinking_delta" : "answer_delta",
        attemptId: 1,
        ts: Date.now(),
        delta: seg.text,
      });
    }

    await streamed.completed;
    emitTrace({
      agentId: "customer-service-manager",
      phase: "manager_completed",
      label: "CustomerServiceManager",
      summary: `完成订单 ${orderId} 的客服回复`,
      metadata: { orderId },
    });
    emit({ eventId: makeEventId(), kind: "done", attemptId: 1, ts: Date.now() });
  } finally {
    repository.close();
  }
};
```

- [ ] **Step 4: Dispatch from `run-agent`**

Modify `lib/chat/run-agent.ts` imports:

```ts
import { extractOrderNumber } from "../customer-service/order-number";
import { runCustomerServiceAgent } from "../customer-service/runner";
```

Extend `RunAgentOptions.env` to use `ServerEnv` or include:

```ts
CUSTOMER_SERVICE_DB_PATH: string;
SHOW_AGENT_TRACE: boolean;
```

At the start of `runAgent`, before building the default SDK agent:

```ts
  if (spec.id === "customer-service") {
    const latestUser = [...messages].reverse().find((message) => message.role === "user");
    const orderId = latestUser ? extractOrderNumber(latestUser.content) : null;
    emit({ eventId: makeEventId(), kind: "accepted", attemptId: 1, agentId: spec.id, ts: Date.now() });
    if (!orderId) {
      emit({
        eventId: makeEventId(),
        kind: "answer_delta",
        attemptId: 1,
        ts: Date.now(),
        delta: "请提供订单号，我帮你查询发货状态。",
      });
      emit({ eventId: makeEventId(), kind: "done", attemptId: 1, ts: Date.now() });
      return;
    }
    await runCustomerServiceAgent({ messages, orderId, emit, env, signal });
    return;
  }
```

If this emits `accepted` twice because `runCustomerServiceAgent` also emits it, remove the `accepted` emit from `runCustomerServiceAgent` and keep it in `runAgent`.

- [ ] **Step 5: Run route test**

Run:

```bash
pnpm test tests/app/api/chat/customer-service-route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run existing chat tests**

Run:

```bash
pnpm test tests/app/api/chat/route.test.ts tests/lib/chat/run-agent.test.ts tests/lib/chat/run-agent-extra.test.ts
```

Expected: PASS. Existing `general` and `qa-coach` behavior must remain unchanged.

- [ ] **Step 7: Commit**

```bash
git add lib/customer-service/runner.ts lib/chat/run-agent.ts tests/app/api/chat/customer-service-route.test.ts tests/lib/chat/run-agent.test.ts tests/lib/chat/run-agent-extra.test.ts
git commit -m "feat: run customer service agent workflow"
```

---

### Task 10: Trace Flag Behavior in Runner

**Files:**
- Modify: `tests/app/api/chat/customer-service-route.test.ts`
- Modify: `lib/customer-service/runner.ts`
- Modify: `lib/agents/customer-service-workflow.ts`

- [ ] **Step 1: Add failing trace-flag route test**

Append to `tests/app/api/chat/customer-service-route.test.ts`:

```ts
  it("passes SHOW_AGENT_TRACE=false to suppress client trace events in the runner", async () => {
    const { getServerEnv } = await import("../../../../lib/config/env");
    vi.mocked(getServerEnv).mockReturnValueOnce({
      OPENAI_BASE_URL: "https://api.example.com/v1",
      OPENAI_API_KEY: "sk-test",
      DEFAULT_MODEL: "gpt-4o-mini",
      AMAP_API_KEY: "amap",
      TAVILY_API_KEY: "tavily",
      CUSTOMER_SERVICE_DB_PATH: "data/customer-service/customer-service.sqlite",
      SHOW_AGENT_TRACE: false,
      DEMO_REQUEST_BUDGET: 50,
      LANGFUSE_PUBLIC_KEY: undefined,
      LANGFUSE_SECRET_KEY: undefined,
      LANGFUSE_HOST: undefined,
      LOG_LEVEL: "info",
      LOG_DIR: "logs",
      LOG_FILE_ENABLED: false,
    });

    vi.mocked(runCustomerServiceAgent).mockImplementation(async ({ emit }) => {
      emit({ eventId: "1", kind: "accepted", attemptId: 1, agentId: "customer-service", ts: 1 });
      emit({ eventId: "2", kind: "done", attemptId: 1, ts: 2 });
    });

    const resp = await POST(makeRequest("订单 1001 为什么没发货"));
    await readStream(resp);
    expect(runCustomerServiceAgent).toHaveBeenCalledWith(expect.objectContaining({
      env: expect.objectContaining({ SHOW_AGENT_TRACE: false }),
    }));
  });
```

- [ ] **Step 2: Add workflow retry trace callback**

Modify `buildCustomerServiceWorkflow` so `withRetry` emits retry traces:

```ts
const withLookupRetry = <T>(
  agentId: string,
  label: string,
  toolName: string,
  orderId: string,
  fn: () => Promise<T>,
): Promise<T> =>
  withRetry(fn, {
    onRetry: ({ attempt, nextDelayMs }) => {
      emitTrace({
        agentId,
        phase: "retry_scheduled",
        label,
        summary: `第 ${attempt} 次查询失败，准备重试`,
        metadata: { orderId, toolName, attempt, nextDelayMs },
      });
    },
  });
```

Use it inside order/logistics summaries:

```ts
const order = await withLookupRetry("order-status-agent", "OrderStatusAgent", "get_order_status", orderId, () =>
  repository.findOrderById(orderId),
);
```

```ts
const logistics = await withLookupRetry("logistics-agent", "LogisticsAgent", "get_logistics_info", orderId, () =>
  repository.findLogisticsByOrderId(orderId),
);
```

- [ ] **Step 3: Run trace flag route tests**

Run:

```bash
pnpm test tests/app/api/chat/customer-service-route.test.ts tests/lib/agents/customer-service-workflow.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/app/api/chat/customer-service-route.test.ts lib/customer-service/runner.ts lib/agents/customer-service-workflow.ts
git commit -m "feat: respect customer service trace visibility"
```

---

### Task 11: README and Manual Verification

**Files:**
- Modify: `README.md`
- Optional modify: `CHANGELOG.md` if this repo keeps versioned entries for planned feature work

- [ ] **Step 1: Update README**

Add a section after built-in tools:

```md
## Customer service multi-agent demo

The `Customer Service` agent demonstrates a SQLite-backed OpenAI Agents SDK workflow:

- `CustomerServiceManager` owns the user-facing answer.
- `OrderStatusAgent` checks order/payment/warehouse state.
- `LogisticsAgent` checks shipping and tracking state.
- `ReplySynthesisAgent` turns the two specialist results into a concise Chinese support reply.

Local setup:

```bash
pnpm seed:customer-service-db
pnpm dev
```

Environment:

- `CUSTOMER_SERVICE_DB_PATH` - SQLite DB path, default `data/customer-service/customer-service.sqlite`.
- `SHOW_AGENT_TRACE` - `true` by default. When `false`, trace events stay in server logs/traces and are not streamed to the chat UI.

File-based SQLite requires a persistent writable filesystem. Use a persistent Node host, VM, or Docker volume for production. On Vercel/serverless, use hosted SQLite/libSQL or another external DB behind the repository interface.
```

- [ ] **Step 2: Run full local verification**

Run:

```bash
pnpm seed:customer-service-db
pnpm test
pnpm typecheck
pnpm lint
```

Expected:

- Seed script prints `Seeded 4 orders into`.
- Unit tests pass.
- Typecheck passes.
- Lint passes.

- [ ] **Step 3: Start dev server**

Run:

```bash
pnpm dev
```

Expected: Next dev server starts. Use the printed local URL.

- [ ] **Step 4: Manual smoke prompts**

In the chat UI, choose `Customer Service` and test:

```text
我的订单为什么还没发货？
```

Expected: assistant asks for an order number and no agent trace appears.

```text
我的订单 1001 为什么还没发货？
```

Expected: assistant explains the order is paid and waiting for fulfillment, with a visible agent trace when `SHOW_AGENT_TRACE=true`.

```text
帮我查一下订单 #9999 的物流
```

Expected: assistant says the order number was not found and asks the user to confirm it.

- [ ] **Step 5: Commit docs**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document customer service multi-agent demo"
```

If `CHANGELOG.md` was not modified, run:

```bash
git add README.md
git commit -m "docs: document customer service multi-agent demo"
```

---

## Self-Review

Spec coverage:

- Missing order number preflight: Task 1 and Task 9.
- OpenAI Agents SDK orchestration only: Task 8 and Task 9.
- SQLite-backed production order/logistics data: Task 2 and Task 3.
- Exponential retry with deterministic tests: Task 4 and Task 10.
- UI trace flag default on: Task 5, Task 6, Task 10.
- Logs/traces when UI trace is off: Task 5 and Task 9.
- Existing agents unchanged: Task 7 and Task 9 focused regression tests.
- Deployment caveat for file SQLite: Task 11.

Placeholder scan:

- No undefined future work markers.
- Steps include exact paths, commands, expected outcomes, and code snippets for the behavior being introduced.

Type consistency:

- `AgentTraceEvent` is introduced in Task 5 and reused by reducer, trace helper, and runner.
- `CustomerServiceRepository` is introduced in Task 3 and reused by workflow builders in Task 8.
- `SHOW_AGENT_TRACE` and `CUSTOMER_SERVICE_DB_PATH` are introduced in Task 6 and passed through route/runner in Task 9.
- `customer-service` is registered before the route tests depend on it.

Implementation warning:

- The checkout previously lacked `node_modules/@openai/agents`, so workers should run `pnpm install` first if focused tests fail from missing packages rather than app code.
- `node:sqlite` may print an experimental warning on Node 22.22.2. Treat the warning as acceptable unless it becomes a runtime error.
