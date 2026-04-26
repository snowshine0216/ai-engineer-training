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
    const row = db
      .prepare(
        "SELECT order_id, customer_name, status, payment_status, paid_at, promised_ship_by, hold_reason, warehouse, sku_summary, updated_at FROM orders WHERE order_id = ?",
      )
      .get(orderId);
    return row ? mapOrderRow(row as Parameters<typeof mapOrderRow>[0]) : null;
  };

  const findLogisticsByOrderId = async (orderId: string): Promise<LogisticsRecord | null> => {
    const shipment = db
      .prepare(
        "SELECT order_id, carrier, tracking_number, status, shipped_at, estimated_delivery_at, latest_location, exception_reason, updated_at FROM shipments WHERE order_id = ?",
      )
      .get(orderId);
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
