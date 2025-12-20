# Resilience & Reliability: The Retry Mechanism

In distributed systems and AI applications that rely on external APIs (like OpenAI, search engines, or internal microservices), transient network failures are inevitable. To ensure a robust user experience, this project implements a sophisticated **Exponential Backoff Retry Mechanism** in `project1_2`.

## 1. Core Technology: Tenacity

The retry mechanism is built upon the [tenacity](https://tenacity.readthedocs.io/) library, which provides a declarative way to define retry strategies.

### Why Exponential Backoff?
Instead of retrying immediately (which can overwhelm a struggling service), exponential backoff increases the wait time between attempts. In this project, the wait time follows the sequence: 1s, 2s, 4s, 8s... up to a configured maximum.

## 2. Key Components

### 2.1 Custom Retry Condition
We don't retry every error. For example, a `404 Not Found` error indicates a client-side issue (resource doesn't exist), so retrying won't help. Our implementation intelligently filters errors:

```python
def should_retry_http_error(exception):
    if isinstance(exception, httpx.HTTPStatusError):
        # Do NOT retry if the resource is genuinely missing
        if exception.response.status_code == 404:
            return False
        return True
    return True
```

### 2.2 Reusable Decorators
We provide pre-configured decorators in `utils/retry.py` for common use cases:

- `default_retry`: Standard 3-attempt strategy with 1s-10s wait.
- `api_retry`: More aggressive 5-attempt strategy with up to 30s wait, designed for volatile API endpoints.

## 3. Implementation in API Client

The `APIClient` in `tools/api_client.py` uses these decorators to wrap asynchronous calls:

```python
@create_retry_decorator(max_attempts=3, min_wait=1.0, max_wait=10.0)
async def get_order_status(self, order_id: str) -> Dict[str, Any]:
    # Logic to call internal service...
```

This ensures that if the simulated FastAPI server experiences a temporary glitch, the AI agents can automatically recover without failing the entire user query.

## 4. Configuration Parameters

The retry behavior is fully configurable through `config/settings.py` or `.env` variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MAX_RETRIES` | Maximum number of retry attempts | 3 |
| `RETRY_DELAY` | Initial delay between retries (seconds) | 1.0 |
| `TIMEOUT` | HTTP request timeout (seconds) | 30.0 |

## 5. Observability

Every retry attempt is logged with detailed information to help diagnose systemic issues:
- Attempt number
- Type of exception encountered
- Time to wait before the next attempt

Example Log:
```text
WARNING | utils.retry:log_retry_attempt:177 | Retry attempt #2 for get_order_status: ConnectTimeout waiting 2.0 seconds...
```

## 6. Benefit for Multi-Agent Systems

In the `AutoGen` customer service system, multiple agents collaborate. If any agent's tool call (API request) fails permanently, the entire conversation might stall. By implementing retries at the tool level, we ensure:
1. **System Stability**: Transient errors are transparently resolved.
2. **User Satisfaction**: Fewer "Service Unavailable" messages.
3. **Cost Efficiency**: Avoids starting new LLM conversations for failures that could be fixed with a 1-second wait.
