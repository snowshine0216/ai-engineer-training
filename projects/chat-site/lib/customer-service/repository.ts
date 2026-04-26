export type OrderRecord = {
  orderId: string;
  status: string;
  paymentStatus: string;
  promisedShipBy: string | null;
  holdReason: string | null;
  warehouse: string | null;
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
  status: string;
  payment_status: string;
  promised_ship_by: string | null;
  hold_reason: string | null;
  warehouse: string | null;
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
  status: row.status,
  paymentStatus: row.payment_status,
  promisedShipBy: row.promised_ship_by,
  holdReason: row.hold_reason,
  warehouse: row.warehouse,
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
