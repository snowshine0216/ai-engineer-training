1. 健康检查
curl.exe -s http://127.0.0.1:8000/health

{"model":"qwen-turbo","kb_index":true,"orders_db":true,"metrics":{"overall":{"count":0,"min_ms":0.0,"max_ms":0.0,"avg_ms":0.0,"p95_ms":0.0},"kb":{"count":0,"min_ms":0.0,"max_ms":0.0,"avg_ms":0.0,"p95_ms":0.0},"order":{"count":0,"min_ms":0.0,"max_ms":0.0,"avg_ms":0.0,"p95_ms":0.0},"direct":{"count":0,"min_ms":0.0,"max_ms":0.0,"avg_ms":0.0,"p95_ms":0.0},"handoff":{"count":0,"min_ms":0.0,"max_ms":0.0,"avg_ms":0.0,"p95_ms":0.0}}}


2. 课程/售前/售后（检索知识库）
curl.exe -s -X POST http://127.0.0.1:8000/chat -H "Content-Type: application/json; charset=utf-8" -d "{\"query\":\"新手能学吗？\"}"

{"route":"course","answer":"新手如果具备一定的项目经验，是可以学习的。建议先通过提供的前置自学资料包补足基础。","sources":[{"source":"D:\\AI工程化训练营\\workspace\\week10\\work\\datas\\data.txt"},{"source":"D:\\AI工程化训练营\\workspace\\week10\\work\\datas\\data.txt"}]}


3. 订单查询（数据库工具）
curl.exe -s -X POST http://127.0.0.1:8000/chat -H "Content-Type: application/json; charset=utf-8" -d "{\"query\":\"查询订单 20251114001 什么时候开课？\"}"

{"route":"order","answer":"您的订单20251114001当前状态为处理中，订单金额为199.0元，最近更新时间为2025年11月15日12:00:00。您已成功报名，开课时间为2025年11月16日09:00:00，请在开课前做好相关预习准备。","sources":null}

4. 人工转接
curl.exe -s -X POST http://127.0.0.1:8000/chat -H "Content-Type: application/json; charset=utf-8" -d "{\"query\":\"转人工\"}"

{"route":"human","answer":{"channel":"default","payload":{"query":"转人工"}},"sources":null}

5. 订单查询 HTTP API
curl.exe -s http://127.0.0.1:8000/api/orders/20251114001

{"order_id":"20251114001","status":"processing","amount":199.0,"updated_at":"2025-11-15 12:00:00","enroll_time":null,"start_time":"2025-11-16 09:00:00"}



缺失能力清单
- 用户交互
  - 开场白：系统在启动时，会向用户打招呼，询问用户需要咨询的问题。
  - 开场白预置问题
    - 课程咨询
    - 订单查询
    - 人工转接
  - 用户问题建议
    - ReAct显式“思考→行动→观察”流程
  - 快捷指令

- 知识库管理
  - 缺少对word、pdf、excel等文件格式的支持
  - 缺少对多模态文件（如图片、语音等）的支持
  - 知识库的增量、删除与备份能力

- 工具
  - 缺少本地模型切换
  - mcp接口的支持

- 部署
  - 缺少对docker的支持
  - 缺少健康检查和指标监控
  - 缺少远程日志记录

- 多租户支持
  - 不同客户/品牌可以在同一平台上部署，互不干扰。
  - 每个客户/品牌可以有自己的知识库、模型配置和用户数据。

- 第三方接入
  - 支持Web、微信、App、第三方接口接入
  - 支持自定义API接口，方便与其他系统集成

- 插件化设计
  - 支持快速扩展新业务
  - 支持自定义插件，如订单处理、课程推荐等
  - 支持 DSL 脚本，方便自定义业务逻辑

- 提供可视化后台（知识库管理、对话记录、监控面板）

- 平台化
  - 完整的 Agent 平台源码包（含 Web 前后端 + 移动 App ）

- 文档
  - 架构设计
  - 部署说明
  - API 文档
  - DSL 规范
  - 性能报告
  - 演示视频：
    - 展示多 Agent 协作
    - 任务编排
    - 移动端推理等核心功能
