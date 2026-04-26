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
