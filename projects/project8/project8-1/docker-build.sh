#!/bin/bash
set -e

# Configuration
IMAGE_NAME="qwen-7b-vllm"
IMAGE_TAG="latest"
MODEL_DIR="./qwen-7b"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Docker build for ${IMAGE_NAME}:${IMAGE_TAG}...${NC}"

# Check if model directory exists
if [ ! -d "$MODEL_DIR" ]; then
    echo -e "${RED}Error: Model directory '$MODEL_DIR' not found in current context.${NC}"
    echo "Please place your Qwen-7B model weights in the 'qwen-7b' folder or update the script."
    echo "Usage: Place the model in ./qwen-7b and run this script."
    exit 1
fi

# Build the image
echo "Building image..."
docker build \
    -t "${IMAGE_NAME}:${IMAGE_TAG}" \
    -f Dockerfile \
    .

echo -e "${GREEN}Build completed successfully!${NC}"
echo "Run './docker-run.sh' to start the service."
