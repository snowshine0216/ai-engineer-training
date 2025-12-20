# AutoGen Multi-Agent Customer Service System

This project is a multi-agent customer service system built with the **AutoGen** framework. It simulates a customer service environment where specialized AI agents collaborate to resolve user queries regarding order status and logistics information.

## 🚀 Key Features

- **Multi-Agent Collaboration**: Specialized agents for Order Queries, Logistics Tracking, and Result Summarization.
- **Asynchronous Architecture**: Built on FastAPI and `httpx` for high-performance non-blocking operations.
- **Robustness (New!)**: Integrated high-reliability architecture with an **Exponential Backoff Retry Mechanism**.
- **Observability**: Rich terminal UI and structured logging for monitoring agent interactions.

## 🛠 Project Structure

- `main.py`: Entry point for the multi-agent system.
- `agents/`: AutoGen agent configurations and logic.
- `api/`: Simulated internal services (FastAPI server).
- `tools/`: API client for communication between agents and services.
- `utils/retry.py`: Core implementation of the retry logic.
- `config/`: Centralized settings management.

## 🔄 The Retry Mechanism

We have implemented a sophisticated retry mechanism to handle transient network failures when agents call internal APIs. This ensures the system remains resilient even when simulated services are temporarily unstable.

### How it works:
- **Library**: Powered by `tenacity`.
- **Strategy**: Exponential Backoff (1s, 2s, 4s, 8s...).
- **Intelligence**: Automatically skips retries for fatal errors like `404 Not Found`.
- **Logging**: Comprehensive logs of every failed attempt and subsequent retry action.

For detailed implementation details, please refer to [RETRY_DOCUMENTATION.md](./RETRY_DOCUMENTATION.md).

## 🚦 Getting Started

### 1. Installation
```bash
pip install -r requirements.txt
```

### 2. Configuration
Copy `.env.example` to `.env` and provide your `OPENAI_API_KEY`.

### 3. Running the System
```bash
python main.py --query "What is the status of my order ORD001?"
```

## 🧪 Testing

The project includes a suite of tests to verify agent coordination and tool reliability.
```bash
pytest
```
