# ==============================================================================
# Build Stage
# ==============================================================================
FROM nvidia/cuda:12.1.1-devel-ubuntu22.04 AS builder

# Set environment variables to minimize interaction
ENV DEBIAN_FRONTEND=noninteractive
ENV PIP_NO_CACHE_DIR=1

# Install Python 3.9 and system build dependencies
# We use deadsnakes PPA to get Python 3.9 on Ubuntu 22.04
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common \
    git \
    curl \
    build-essential \
    && add-apt-repository ppa:deadsnakes/ppa -y \
    && apt-get update && apt-get install -y --no-install-recommends \
    python3.9 \
    python3.9-dev \
    python3.9-distutils \
    python3.9-venv \
    && curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py \
    && python3.9 get-pip.py \
    && rm get-pip.py \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python3.9 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
# Pinning versions for stability as requested
# vLLM 0.4.3 is selected to support the requested 'vllm.entrypoints.api_server' entrypoint.
# Newer versions (0.5.0+) recommend 'vllm serve' or 'vllm.entrypoints.openai.api_server'.
RUN pip install --upgrade pip && \
    pip install \
    torch==2.3.0 \
    vllm==0.4.3 \
    transformers==4.40.0 \
    fastapi \
    uvicorn \
    accelerate \
    ray

# ==============================================================================
# Final Stage
# ==============================================================================
FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV MODEL_PATH=/opt/model/qwen-7b
ENV PATH="/opt/venv/bin:$PATH"
ENV LC_ALL=C.UTF-8
ENV LANG=C.UTF-8

# Install Python 3.9 runtime dependencies (minimal)
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common \
    curl \
    && add-apt-repository ppa:deadsnakes/ppa -y \
    && apt-get update && apt-get install -y --no-install-recommends \
    python3.9 \
    python3.9-distutils \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 -s /bin/bash service-user

# Copy virtual environment from builder
COPY --from=builder --chown=service-user:service-user /opt/venv /opt/venv

# Setup model directory structure
WORKDIR /opt/model
RUN mkdir -p /opt/model/qwen-7b && chown -R service-user:service-user /opt/model

# Copy model weights
# Note: This expects a folder named 'qwen-7b' in the build context.
COPY --chown=service-user:service-user ./qwen-7b /opt/model/qwen-7b

# Switch to non-root user
USER service-user
WORKDIR /home/service-user

# Expose port
EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f -X POST http://localhost:8000/generate -d '{"prompt": "Health check", "max_tokens": 1}' || exit 1

# Start command
# Using shell form to allow variable expansion for ${MODEL_PATH}
CMD python -m vllm.entrypoints.api_server \
    --model ${MODEL_PATH} \
    --tensor-parallel-size 1 \
    --gpu-memory-utilization 0.9 \
    --host 0.0.0.0 \
    --port 8000 \
    --trust-remote-code
