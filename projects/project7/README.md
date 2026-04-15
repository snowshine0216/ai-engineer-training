# 多模态 RAG 智能体系统

基于 LangChain 框架和 Qwen-VL 多模态模型构建的智能体系统，支持图像理解、长期记忆检索（RAG）和多轮对话管理。

## 功能特性

1.  **图像理解**：利用 Qwen-VL 模型识别图片内容，并根据关键词提取特定信息。
2.  **长期记忆 (RAG)**：自动保存对话历史，并在新任务中检索相关背景信息，实现跨会话记忆。
3.  **模块化设计**：存储、检索、处理逻辑分离，易于扩展。

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置 API Key

编辑 `config.yaml` 文件，填入你的 DashScope API Key：

```yaml
model:
  api_key: "YOUR_API_KEY"
```

### 3. 运行 Agent

```bash

python rag_main.py -i vehicle_certificate-1.png --ingest
python rag_main.py -q "驾驶室准乘人数"
```
