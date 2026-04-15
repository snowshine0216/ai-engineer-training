#!/bin/bash
set -e

# Configuration
IMAGE_NAME="qwen-7b-vllm"
IMAGE_TAG="latest"
CONTAINER_NAME="vllm-service"
PORT=8000
LOG_DIR="./logs"
CACHE_DIR="${HOME}/.cache/huggingface"

# Create directories if they don't exist
mkdir -p "$LOG_DIR"
mkdir -p "$CACHE_DIR"

# Colors
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}Stopping any existing container named ${CONTAINER_NAME}...${NC}"
docker rm -f ${CONTAINER_NAME} 2>/dev/null || true

echo -e "${GREEN}Starting container...${NC}"
docker run -d \
    --name ${CONTAINER_NAME} \
    --gpus all \
    --restart unless-stopped \
    -p ${PORT}:8000 \
    -v "$(pwd)/logs:/home/service-user/logs" \
    -v "${CACHE_DIR}:/home/service-user/.cache/huggingface" \
    --shm-size 16g \
    "${IMAGE_NAME}:${IMAGE_TAG}"

echo -e "${GREEN}Container started. ID: $(docker ps -q -f name=${CONTAINER_NAME})${NC}"
echo "Waiting for service to be ready..."

# Wait for health check (simple loop)
for i in {1..30}; do
    if curl -s -X POST http://localhost:${PORT}/generate -d '{"prompt": "Hi", "max_tokens": 1}' > /dev/null; then
        echo -e "${GREEN}Service is READY!${NC}"
        echo "Test endpoint: curl -X POST http://localhost:${PORT}/generate -d '{\"prompt\": \"Hello AI\", \"max_tokens\": 20}'"
        exit 0
    fi
    echo "Waiting... ($i/30)"
    sleep 5
done

echo "Service failed to start within timeout. Check logs: docker logs ${CONTAINER_NAME}"
exit 1
