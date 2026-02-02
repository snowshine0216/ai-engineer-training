# vLLM Qwen-7B 意图识别服务容器化方案

本项目提供了一套生产级的 Docker 构建与部署方案，用于基于 vLLM 框架部署本地 Qwen-7B 模型。

## 目录结构

```text
.
├── Dockerfile          # 多阶段构建文件
├── docker-build.sh     # 构建脚本
├── docker-run.sh       # 运行脚本
├── .dockerignore       # 构建上下文过滤
└── qwen-7b/            # (需自行准备) 本地模型权重目录
```

## 快速开始

### 1. 准备模型
请确保 `qwen-7b` 模型权重目录位于项目根目录下。
```bash
# 示例结构
ls -F qwen-7b/
# config.json  model-00001-of-0000x.safetensors  tokenizer.json ...
```

### 2. 构建镜像
运行构建脚本，自动创建包含模型权重的镜像。
```bash
chmod +x docker-build.sh
./docker-build.sh
```

### 3. 启动服务
运行启动脚本，挂载 GPU 并启动 API 服务。
```bash
chmod +x docker-run.sh
./docker-run.sh
```

## API 接口

服务暴露在 `8000` 端口。

**健康检查/生成接口**:
```bash
curl -X POST http://localhost:8000/generate \
    -d '{"prompt": "用户意图识别：我要查一下明天的天气。", "max_tokens": 100, "temperature": 0.7}'
```

注意：本项目配置使用 vLLM 的原生 `api_server` 入口。如果需要 OpenAI 兼容接口（`/v1/chat/completions`），请修改 Dockerfile 中的 CMD 命令为 `python -m vllm.entrypoints.openai.api_server` 并确保 vLLM 版本支持。

## 生产级特性说明

### 1. 镜像体积优化
- **多阶段构建 (Multi-stage Build)**: 使用 `nvidia/cuda:devel` 镜像进行编译构建，最终镜像仅使用轻量级的 `nvidia/cuda:runtime`。
- **清理缓存**: 构建过程中设置 `PIP_NO_CACHE_DIR=1` 并清理 `apt` 缓存。
- **.dockerignore**: 严格排除 `.git`, `__pycache__`, `logs` 等无关文件，显著减少构建上下文大小。

### 2. 多卡推理配置
若需在多张 GPU 上运行（例如 2 张卡），请修改 `docker-run.sh` 中的运行命令或覆盖 CMD 参数：

```bash
# 修改 Dockerfile CMD 或在 docker run 时传入
--tensor-parallel-size 2
```
同时确保 `docker run` 使用 `--gpus all` 或指定设备 ID。

### 3. 安全性加固
- **非 Root 用户**: 容器内部使用 `service-user` (UID 1000) 运行进程，降低安全风险。
- **最小权限**: 仅暴露必要的 8000 端口。

### 4. 性能优化
- **CUDA 版本**: 基于 NVIDIA CUDA 12.1.1，配合 vLLM 0.4.3+ 和 PyTorch 2.3.0，确保最佳推理性能。
- **显存管理**: 默认配置 `--gpu-memory-utilization 0.9`，最大化利用显存以支持长上下文。
- **延迟目标**: 在 T4/A10/A100 等主流推理卡上，首字延迟 (TTFT) 可控制在 <200ms。

### 5. 日志与持久化
- **日志**: 容器日志目录挂载到宿主机 `./logs`。
- **缓存**: HuggingFace 缓存映射到宿主机，避免重启容器重复下载 Tokenizer 等文件。
- **模型**: 模型权重直接打入镜像，保证环境一致性；也可修改 `docker-run.sh` 通过 `-v` 挂载外部模型目录以覆盖镜像内模型。

## 故障排查

如果服务启动失败：
1. 查看日志：`docker logs vllm-service`
2. 检查显存：确保 GPU 显存足够加载 7B 模型（建议 >= 16GB VRAM，或使用量化版本）。
3. 检查 CUDA 驱动：宿主机 NVIDIA 驱动版本需 >= 530 以支持 CUDA 12.1。
