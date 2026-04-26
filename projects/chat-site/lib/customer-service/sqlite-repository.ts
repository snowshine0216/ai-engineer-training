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
  // DatabaseSync executes queries synchronously and blocks the Node.js event loop.
  // This is an accepted trade-off for a single-instance demo; concurrent requests
  // will queue behind each DB call. Migrate to an async driver before production scale.
  const db = new DatabaseSync(dbPath, { readOnly: true });

  const stmtFindOrder = db.prepare(
    "SELECT order_id, status, payment_status, promised_ship_by, hold_reason, warehouse FROM orders WHERE order_id = ?",
  );
  const stmtFindShipment = db.prepare(
    "SELECT order_id, carrier, tracking_number, status, shipped_at, estimated_delivery_at, latest_location, exception_reason, updated_at FROM shipments WHERE order_id = ?",
  );
  const stmtFindEvents = db.prepare(
    "SELECT event_time, event_code, event_label, location, detail FROM logistics_events WHERE order_id = ? ORDER BY event_time DESC",
  );

  const findOrderById = async (orderId: string): Promise<OrderRecord | null> => {
    const row = stmtFindOrder.get(orderId);
    return row ? mapOrderRow(row as Parameters<typeof mapOrderRow>[0]) : null;
  };

  const findLogisticsByOrderId = async (orderId: string): Promise<LogisticsRecord | null> => {
    const shipment = stmtFindShipment.get(orderId);
    if (!shipment) return null;

    const eventRows = stmtFindEvents.all(orderId);

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
