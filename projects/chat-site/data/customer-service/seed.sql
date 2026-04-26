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
