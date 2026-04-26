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

  it("extracts a 32-character order number (max allowed by regex)", () => {
    const id32 = "A" + "x".repeat(31); // 1 anchor + 31 body = 32 chars
    expect(extractOrderNumber(`订单 ${id32}`)).toBe(id32);
  });

  it("extracts at most 32 chars from a 33-char candidate", () => {
    const id33 = "A" + "x".repeat(32); // 33 chars — regex body allows max 31
    const result = extractOrderNumber(`订单 ${id33}`);
    expect(result).toBe("A" + "x".repeat(31)); // only 32 chars captured
  });

  it("returns null for a 2-character candidate (below minimum 3 chars)", () => {
    expect(extractOrderNumber("订单 Ax")).toBeNull();
  });
});
