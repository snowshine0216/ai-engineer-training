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
