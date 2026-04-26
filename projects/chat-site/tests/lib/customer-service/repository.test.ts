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
