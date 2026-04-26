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
