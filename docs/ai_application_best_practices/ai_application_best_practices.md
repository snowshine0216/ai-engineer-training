# AI Application Best Practices: A Comprehensive Guide for Production Deployment

> Based on practical implementation patterns from the LangChain Multi-Task Q&A Assistant project

## Table of Contents

1. [Introduction](#1-introduction)
2. [Project Architecture & Structure](#2-project-architecture--structure)
3. [Agent Design Patterns](#3-agent-design-patterns)
4. [Tool Integration Best Practices](#4-tool-integration-best-practices)
5. [Configuration Management](#5-configuration-management)
6. [Logging & Observability](#6-logging--observability)
7. [Error Handling & Resilience](#7-error-handling--resilience)
8. [Performance Optimization](#8-performance-optimization)
9. [Testing Strategies](#9-testing-strategies)
10. [Deployment Guidelines](#10-deployment-guidelines)
11. [Security Considerations](#11-security-considerations)
12. [Continuous Improvement](#12-continuous-improvement)

---

## 1. Introduction

Building AI applications that are ready for production requires a fundamentally different approach than traditional software engineering. Large Language Models (LLMs) are non-deterministic, external API-dependent, and can exhibit unpredictable behaviors. This guide provides battle-tested best practices based on real-world implementation experience.

### Key Principles

- **Modularity First**: Separate concerns to enable independent testing and scaling
- **Fail Gracefully**: Anticipate failures and degrade gracefully
- **Observe Everything**: LLMs are black boxes; visibility is critical
- **Secure by Default**: API keys and sensitive data must be protected
- **Cost Awareness**: Monitor and optimize token usage continuously

---

## 2. Project Architecture & Structure

### 2.1 Recommended Directory Structure

```
project_root/
├── .env.example                 # Environment variable template
├── main.py                      # Application entry point
├── requirements.txt             # Python dependencies
├── agents/                      # AI agent modules
│   └── qa_agent.py             # Core agent implementation
├── config/                      # Configuration management
│   └── settings.py             # Pydantic-based settings
├── core/                        # Core utilities
│   └── logger.py               # Logging configuration
├── tools/                       # External tool integrations
│   ├── weather_tool.py         # Weather API integration
│   ├── search_tool.py          # Search API integration
│   └── tool_schemas.py         # Pydantic schemas for tools
├── services/                    # Business logic services
├── models/                      # Data models
├── tests/                       # Test suite
│   ├── unit/                   # Unit tests
│   ├── integration/            # Integration tests
│   └── e2e/                    # End-to-end tests
├── scripts/                     # Utility scripts
│   └── setup_environment.py    # Environment setup
└── logs/                        # Log files directory
```

### 2.2 Key Design Principles

| Principle | Description | Example |
| **Single Responsibility** | Each module should have one clear purpose | `qa_agent.py` handles orchestration only |
| **Dependency Injection** | Pass dependencies explicitly | Tools are initialized externally and passed to agents |
| **Configuration Isolation** | All settings in one place | `config/settings.py` manages all configurations |
| **Separation of Concerns** | Business logic ≠ Infrastructure | Tools in `tools/`, agent logic in `agents/` |

---

## 3. Agent Design Patterns

### 3.1 LangChain Agent Architecture

The modern approach uses the `prompt | llm | output` pipeline pattern:

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.tools import tool

class QAAgent:
    """Simplified QA Agent using LangChain's pipeline syntax"""
    
    def __init__(self, session_id: str = None):
        self.session_id = session_id or str(uuid.uuid4())
        self.conversation_history = []
        
        # Initialize tools
        self.tools = self._create_tools()
        
        # Initialize LLM with tool binding
        # to enhance here, the llm should be put in to a separated class
        self.llm = ChatOpenAI(
            model="gpt-4o",
            temperature=0.3,
            max_tokens=1000
        )
        self.llm_with_tools = self.llm.bind_tools(self.tools)
        
        # Create general conversation chain
        self.general_chain = self._create_general_chain()
```

### 3.2 Tool Binding Pattern

Use the `@tool` decorator with Pydantic schemas for type safety:

```python
from langchain_core.tools import tool
from pydantic.v1 import BaseModel, Field

class WeatherQuery(BaseModel):
    """Schema for weather query tool"""
    city_name: str = Field(
        ..., 
        description="City name to query weather for, e.g., Beijing, Shanghai"
    )

@tool("weather_query", args_schema=WeatherQuery)
def weather_query(city_name: str) -> str:
    """Query weather information for a specified city"""
    try:
        result = weather_tool.get_weather(city_name)
        if result.get("success"):
            return result.get("data", "Failed to get weather info")
        return f"Failed to get weather for {city_name}"
    except Exception as e:
        return f"Weather query failed: {str(e)}"
```

### 3.3 Conversation History Management

Implement bounded conversation history to prevent context overflow:

```python
def chat(self, user_input: str) -> Dict[str, Any]:
    # ... process input ...
    
    # Record conversation history
    self.conversation_history.append({
        "user": user_input,
        "assistant": final_response,
        "timestamp": datetime.now().isoformat(),
        "tools_used": tools_used
    })
    
    # Limit history length to prevent memory issues
    max_history = settings.app.max_conversation_history
    if len(self.conversation_history) > max_history:
        self.conversation_history = self.conversation_history[-max_history:]
```

---

## 4. Tool Integration Best Practices

### 4.1 Schema Definition

Always define clear, descriptive schemas for LLM tool calls:

```python
class NewsSearch(BaseModel):
    """News search tool schema"""
    
    query: str = Field(
        ..., 
        description="Search keywords or question to find related news"
    )
    
    max_results: Optional[int] = Field(
        default=5,
        description="Maximum number of results to return, default is 5"
    )
    
    class Config:
        schema_extra = {
            "examples": [
                {"query": "AI latest developments", "max_results": 5},
                {"query": "technology news", "max_results": 3}
            ]
        }
```

### 4.2 Tool Implementation Pattern

Follow this pattern for robust tool implementation:

```python
class ExternalApiTool:
    """Template for external API tool integration"""
    
    def __init__(self):
        self.api_key = settings.api.service_api_key
        self.base_url = "https://api.service.com"
        self.timeout = 10  # seconds
        self.max_retries = 3
        
        app_logger.info("External API tool initialized")
    
    def execute(self, params: dict) -> Dict[str, Any]:
        """Execute the tool with proper error handling"""
        try:
            response = requests.get(
                self.base_url,
                params={**params, "key": self.api_key},
                timeout=self.timeout
            )
            response.raise_for_status()
            
            data = response.json()
            
            if data.get("status") == "success":
                return {"success": True, "data": self._format_response(data)}
            else:
                return {"success": False, "error": data.get("message", "Unknown error")}
                
        except requests.exceptions.Timeout:
            app_logger.error("API request timed out")
            return {"success": False, "error": "Request timed out, please retry"}
            
        except requests.exceptions.RequestException as e:
            app_logger.error(f"API request failed: {str(e)}")
            return {"success": False, "error": f"Network request failed: {str(e)}"}
            
        except Exception as e:
            app_logger.error(f"Unknown error occurred: {str(e)}")
            return {"success": False, "error": f"Tool execution failed: {str(e)}"}
```

### 4.3 Tool Result Formatting

Format tool results for LLM consumption:

```python
def _format_response(self, raw_data: Dict[str, Any]) -> str:
    """Format raw API response into LLM-friendly text"""
    try:
        formatted_info = f"""
        🌡️ Temperature: {raw_data.get("temperature", "N/A")}°C
        🌤️ Weather: {raw_data.get("weather", "N/A")}
        💨 Wind: {raw_data.get("wind_direction", "N/A")} {raw_data.get("wind_speed", "N/A")}
        💧 Humidity: {raw_data.get("humidity", "N/A")}%
        🕐 Updated: {raw_data.get("update_time", "N/A")}
        """.strip()
        
        return formatted_info
        
    except Exception as e:
        app_logger.error(f"Failed to format response: {str(e)}")
        return f"Data formatting failed: {str(e)}"
```

---

## 5. Configuration Management

### 5.1 Pydantic-Based Settings

Use Pydantic for type-safe, validated configuration:

```python
from pydantic_settings import BaseSettings
from pydantic import Field, validator

class APISettings(BaseSettings):
    """API-related configuration"""
    
    openai_api_key: str = Field(..., description="OpenAI API key")
    openai_base_url: str = Field(
        default="https://api.openai.com/v1", 
        description="OpenAI API base URL"
    )
    
    @validator('openai_api_key')
    def validate_api_keys(cls, v):
        """Validate API key is not empty"""
        if not v or v.strip() == "":
            raise ValueError("API key cannot be empty")
        return v.strip()
    
    class Config:
        env_prefix = ""
        case_sensitive = False
```

### 5.2 Singleton Configuration Pattern

Implement singleton pattern for global configuration:

```python
class Settings:
    """Global configuration manager with singleton pattern"""
    
    _instance = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not self._initialized:
            try:
                self.api = APISettings()
                self.redis = RedisSettings()
                self.app = AppSettings()
                self._initialized = True
            except Exception as e:
                raise RuntimeError(f"Configuration initialization failed: {str(e)}")
    
    def validate_all(self) -> bool:
        """Validate all configurations at startup"""
        try:
            if not self.api.openai_api_key:
                print("❌ OpenAI API key not configured")
                return False
            print("✅ Configuration validation passed")
            return True
        except Exception as e:
            print(f"❌ Configuration validation failed: {str(e)}")
            return False

# Global configuration instance
settings = Settings()
```

### 5.3 Environment Variable Template

Always provide a `.env.example` template:

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1

# External Service APIs
AMAP_API_KEY=your-amap-api-key-here
TAVILY_API_KEY=tvly-your-api-key-here

# Redis Configuration (Optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=

# Application Configuration
APP_NAME=MultiTaskQAAssistant
APP_VERSION=1.0.0
LOG_LEVEL=INFO
MAX_CONVERSATION_HISTORY=50
CACHE_TTL=3600
```

---

## 6. Logging & Observability

### 6.1 Structured Logging with Loguru

Use Loguru for modern, structured logging:

```python
from loguru import logger
import sys

def configure_logging():
    """Configure structured logging for the application"""
    
    # Remove default handler
    logger.remove()
    
    # Console output with color
    logger.add(
        sys.stdout,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
               "<level>{level: <8}</level> | "
               "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
               "<level>{message}</level>",
        level="INFO"
    )
    
    # File output with rotation
    logger.add(
        "logs/app_{time:YYYY-MM-DD}.log",
        rotation="00:00",  # New file every day
        retention="30 days",  # Keep 30 days of logs
        compression="zip",  # Compress old logs
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} | {message}"
    )
    
    # Separate error log
    logger.add(
        "logs/error_{time:YYYY-MM-DD}.log",
        rotation="00:00",
        retention="30 days",
        level="ERROR",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} | {message}"
    )
    
    return logger

app_logger = configure_logging()
```

### 6.2 Request Lifecycle Logging

Track the complete lifecycle of each request:

```python
def chat(self, user_input: str) -> Dict[str, Any]:
    start_time = time.time()
    request_id = str(uuid.uuid4())[:8]
    
    app_logger.info(f"[{request_id}] Processing user input: {user_input[:100]}...")
    
    try:
        # Process with LLM
        response = self.llm_with_tools.invoke(user_input)
        
        if response.tool_calls:
            app_logger.info(f"[{request_id}] Tool calls detected: {len(response.tool_calls)}")
            for tool_call in response.tool_calls:
                app_logger.info(f"[{request_id}] Calling tool: {tool_call['name']}")
        
        processing_time = (time.time() - start_time) * 1000
        app_logger.info(f"[{request_id}] Request completed in {processing_time:.1f}ms")
        
        return {
            "response": final_response,
            "processing_time_ms": processing_time,
            "tools_used": tools_used,
            "request_id": request_id
        }
        
    except Exception as e:
        app_logger.error(f"[{request_id}] Request failed: {str(e)}")
        raise
```

### 6.3 Cost Tracking

Monitor token usage for operational cost management:

```python
class TokenUsageTracker:
    """Track token usage across LLM calls"""
    
    def __init__(self):
        self.total_prompt_tokens = 0
        self.total_completion_tokens = 0
        self.request_count = 0
    
    def record_usage(self, prompt_tokens: int, completion_tokens: int):
        self.total_prompt_tokens += prompt_tokens
        self.total_completion_tokens += completion_tokens
        self.request_count += 1
        
        # Log usage
        app_logger.info(
            f"Token usage: prompt={prompt_tokens}, completion={completion_tokens}, "
            f"total_session={self.total_tokens}"
        )
    
    @property
    def total_tokens(self) -> int:
        return self.total_prompt_tokens + self.total_completion_tokens
    
    def get_estimated_cost(self, model: str = "gpt-4o") -> float:
        """Estimate cost based on model pricing"""
        pricing = {
            "gpt-4o": {"prompt": 0.005, "completion": 0.015},  # per 1K tokens
            "gpt-4": {"prompt": 0.03, "completion": 0.06},
            "gpt-3.5-turbo": {"prompt": 0.0005, "completion": 0.0015}
        }
        
        if model not in pricing:
            return 0.0
            
        prompt_cost = (self.total_prompt_tokens / 1000) * pricing[model]["prompt"]
        completion_cost = (self.total_completion_tokens / 1000) * pricing[model]["completion"]
        
        return prompt_cost + completion_cost
```

---

## 7. Error Handling & Resilience

### 7.1 Error Classification

Categorize errors for appropriate handling:

```python
from enum import Enum

class ErrorCategory(Enum):
    NETWORK = "network"           # Transient, retry-able
    AUTHENTICATION = "auth"       # Configuration issue
    RATE_LIMIT = "rate_limit"    # Backoff required
    VALIDATION = "validation"     # User input issue
    INTERNAL = "internal"         # Bug in code
    EXTERNAL = "external"         # Third-party service issue

class AIApplicationError(Exception):
    """Base exception for AI application errors"""
    
    def __init__(self, message: str, category: ErrorCategory, retryable: bool = False):
        super().__init__(message)
        self.category = category
        self.retryable = retryable
```

### 7.2 Retry Logic with Exponential Backoff

Implement intelligent retry for transient failures:

```python
import time
from functools import wraps

def retry_with_backoff(max_retries: int = 3, base_delay: float = 1.0):
    """Decorator for retry logic with exponential backoff"""
    
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    
                    if not getattr(e, 'retryable', True):
                        raise
                    
                    if attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        app_logger.warning(
                            f"Attempt {attempt + 1} failed, retrying in {delay}s: {str(e)}"
                        )
                        time.sleep(delay)
            
            raise last_exception
        
        return wrapper
    return decorator

# Usage
@retry_with_backoff(max_retries=3, base_delay=1.0)
def call_external_api(params: dict):
    response = requests.get(API_URL, params=params, timeout=10)
    response.raise_for_status()
    return response.json()
```

### 7.3 Graceful Degradation

Provide fallback behavior when services fail:

```python
def chat(self, user_input: str) -> Dict[str, Any]:
    try:
        # Try full LLM processing with tools
        return self._process_with_tools(user_input)
        
    except OpenAIRateLimitError:
        app_logger.warning("Rate limited, falling back to basic response")
        return self._fallback_response(user_input)
        
    except ToolExecutionError as e:
        app_logger.warning(f"Tool failed, continuing with LLM-only response: {e}")
        return self._process_without_tools(user_input)
        
    except Exception as e:
        app_logger.error(f"Unexpected error: {e}")
        return {
            "response": "I apologize, but I'm experiencing technical difficulties. Please try again.",
            "error": str(e),
            "tools_used": []
        }
```

---

## 8. Performance Optimization

### 8.1 Caching Strategy

Implement multi-layer caching:

```python
import redis
import hashlib
import json
from functools import lru_cache

class CacheManager:
    """Multi-layer caching for AI application"""
    
    def __init__(self):
        self.redis_client = redis.Redis(
            host=settings.redis.redis_host,
            port=settings.redis.redis_port,
            db=settings.redis.redis_db
        )
        self.local_cache = {}
    
    def get(self, key: str) -> Optional[Any]:
        """Get from cache with fallback to Redis"""
        # Check in-memory cache first
        if key in self.local_cache:
            return self.local_cache[key]
        
        # Check Redis
        try:
            data = self.redis_client.get(key)
            if data:
                result = json.loads(data)
                self.local_cache[key] = result
                return result
        except Exception as e:
            app_logger.warning(f"Redis get failed: {e}")
        
        return None
    
    def set(self, key: str, value: Any, ttl: int = 3600):
        """Set in both local and Redis cache"""
        self.local_cache[key] = value
        
        try:
            self.redis_client.setex(key, ttl, json.dumps(value))
        except Exception as e:
            app_logger.warning(f"Redis set failed: {e}")
    
    @staticmethod
    def generate_cache_key(prefix: str, params: dict) -> str:
        """Generate consistent cache key from parameters"""
        param_str = json.dumps(params, sort_keys=True)
        hash_value = hashlib.md5(param_str.encode()).hexdigest()
        return f"{prefix}:{hash_value}"

# Usage in tool
class WeatherTool:
    def get_weather(self, city_name: str) -> Dict[str, Any]:
        cache_key = cache_manager.generate_cache_key("weather", {"city": city_name})
        
        # Try cache first
        cached = cache_manager.get(cache_key)
        if cached:
            app_logger.info(f"Weather cache hit for {city_name}")
            return cached
        
        # Fetch from API
        result = self._fetch_from_api(city_name)
        
        # Cache on success
        if result.get("success"):
            cache_manager.set(cache_key, result, ttl=1800)  # 30 minutes
        
        return result
```

### 8.2 Async Processing

Use async/await for concurrent I/O operations:

```python
import asyncio
import aiohttp

class AsyncToolExecutor:
    """Execute multiple tools concurrently"""
    
    async def execute_tools(self, tool_calls: List[dict]) -> List[dict]:
        """Execute tool calls concurrently"""
        async with aiohttp.ClientSession() as session:
            tasks = [
                self._execute_single_tool(session, tool_call)
                for tool_call in tool_calls
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
        return [
            {"success": not isinstance(r, Exception), "result": r}
            for r in results
        ]
    
    async def _execute_single_tool(
        self, 
        session: aiohttp.ClientSession, 
        tool_call: dict
    ) -> str:
        """Execute a single tool call asynchronously"""
        tool_name = tool_call["name"]
        tool_args = tool_call["args"]
        
        if tool_name == "weather_query":
            return await self._async_weather_query(session, tool_args)
        elif tool_name == "news_search":
            return await self._async_news_search(session, tool_args)
        else:
            raise ValueError(f"Unknown tool: {tool_name}")
```

### 8.3 Response Streaming

Stream long responses for better UX:

```python
async def stream_response(self, user_input: str):
    """Stream LLM response for real-time feedback"""
    
    response_stream = await self.llm.astream(user_input)
    
    full_response = ""
    async for chunk in response_stream:
        content = chunk.content
        full_response += content
        yield content  # Yield each chunk to the frontend
    
    # Log complete response
    app_logger.info(f"Streamed response: {len(full_response)} characters")
```

---

## 9. Testing Strategies

### 9.1 Unit Testing for Tools

Test tools in isolation with mocked dependencies:

```python
import pytest
from unittest.mock import patch, MagicMock

class TestWeatherTool:
    """Unit tests for weather tool"""
    
    @pytest.fixture
    def weather_tool(self):
        with patch('tools.weather_tool.settings') as mock_settings:
            mock_settings.api.amap_api_key = "test_key"
            return WeatherTool()
    
    def test_get_weather_success(self, weather_tool):
        """Test successful weather query"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "status": "1",
            "lives": [{"temperature": "25", "weather": "Sunny"}]
        }
        
        with patch('requests.get', return_value=mock_response):
            result = weather_tool.get_weather("Beijing")
            
        assert result["success"] is True
        assert "25" in result["data"]
    
    def test_get_weather_city_not_found(self, weather_tool):
        """Test weather query with unknown city"""
        result = weather_tool.get_weather("NonexistentCity")
        
        assert result["success"] is False
        assert "not found" in result["error"].lower()
    
    def test_get_weather_api_timeout(self, weather_tool):
        """Test handling of API timeout"""
        with patch('requests.get', side_effect=requests.exceptions.Timeout):
            result = weather_tool.get_weather("Beijing")
            
        assert result["success"] is False
        assert "timeout" in result["error"].lower()
```

### 9.2 Integration Testing for Agent

Test the complete agent workflow:

```python
class TestQAAgentIntegration:
    """Integration tests for QA agent"""
    
    @pytest.fixture
    def agent(self):
        return create_qa_agent(session_id="test-session")
    
    def test_weather_query_e2e(self, agent):
        """Test end-to-end weather query"""
        result = agent.chat("查询北京天气")
        
        assert "response" in result
        assert "processing_time_ms" in result
        assert "amap_weather_tool" in result["tools_used"]
    
    def test_general_conversation(self, agent):
        """Test general conversation without tools"""
        result = agent.chat("你好，你能做什么？")
        
        assert "response" in result
        assert result["tools_used"] == []
    
    def test_conversation_history(self, agent):
        """Test conversation history management"""
        agent.chat("查询北京天气")
        agent.chat("再查上海")
        
        history = agent.get_conversation_history()
        assert len(history) == 2
```

### 9.3 Prompt Testing

Version and test prompts systematically:

```python
class PromptTester:
    """Test prompts with various inputs"""
    
    def __init__(self, prompt_template: str):
        self.prompt_template = prompt_template
        self.test_cases = []
    
    def add_test_case(
        self, 
        input_vars: dict, 
        expected_behavior: str,
        forbidden_patterns: List[str] = None
    ):
        self.test_cases.append({
            "inputs": input_vars,
            "expected": expected_behavior,
            "forbidden": forbidden_patterns or []
        })
    
    async def run_tests(self, llm) -> List[dict]:
        """Run all test cases and report results"""
        results = []
        
        for case in self.test_cases:
            prompt = self.prompt_template.format(**case["inputs"])
            response = await llm.ainvoke(prompt)
            
            passed = True
            for forbidden in case["forbidden"]:
                if forbidden.lower() in response.content.lower():
                    passed = False
                    break
            
            results.append({
                "inputs": case["inputs"],
                "response": response.content,
                "passed": passed
            })
        
        return results
```

---

## 10. Deployment Guidelines

### 10.1 Docker Containerization

Create a production-ready Dockerfile:

```dockerfile
# Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Create non-root user for security
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "from config.settings import settings; print(settings.validate_all())" || exit 1

# Run application
CMD ["python", "main.py"]
```

### 10.2 Docker Compose for Local Development

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - AMAP_API_KEY=${AMAP_API_KEY}
      - TAVILY_API_KEY=${TAVILY_API_KEY}
      - REDIS_HOST=redis
      - LOG_LEVEL=INFO
    depends_on:
      - redis
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

### 10.3 Kubernetes Deployment

```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-assistant
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ai-assistant
  template:
    metadata:
      labels:
        app: ai-assistant
    spec:
      containers:
      - name: ai-assistant
        image: ai-assistant:latest
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        envFrom:
        - secretRef:
            name: ai-assistant-secrets
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
```

---

## 11. Security Considerations

### 11.1 API Key Management

```python
# Never do this:
API_KEY = "sk-1234567890abcdef"  # ❌ Hardcoded key

# Do this instead:
import os
from pydantic import SecretStr

class SecureAPISettings(BaseSettings):
    openai_api_key: SecretStr = Field(..., description="OpenAI API key")
    
    def get_openai_key(self) -> str:
        """Return the actual key value only when needed"""
        return self.openai_api_key.get_secret_value()
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
```

### 11.2 Input Sanitization

Protect against prompt injection:

```python
import re

class InputSanitizer:
    """Sanitize user input to prevent prompt injection"""
    
    DANGEROUS_PATTERNS = [
        r"ignore (all )?(previous|above) instructions",
        r"disregard (all )?(previous|above)",
        r"system\s*:\s*",
        r"<\|.*?\|>",
    ]
    
    @classmethod
    def sanitize(cls, text: str) -> str:
        """Remove potentially dangerous patterns from input"""
        sanitized = text
        
        for pattern in cls.DANGEROUS_PATTERNS:
            sanitized = re.sub(pattern, "", sanitized, flags=re.IGNORECASE)
        
        # Limit input length
        max_length = 4000
        if len(sanitized) > max_length:
            sanitized = sanitized[:max_length]
        
        return sanitized.strip()
    
    @classmethod
    def is_safe(cls, text: str) -> bool:
        """Check if input is safe"""
        for pattern in cls.DANGEROUS_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                return False
        return True
```

### 11.3 Rate Limiting

Implement rate limiting to prevent abuse:

```python
from datetime import datetime
from collections import defaultdict

class RateLimiter:
    """Simple in-memory rate limiter"""
    
    def __init__(self, max_requests: int = 10, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = defaultdict(list)
    
    def is_allowed(self, user_id: str) -> bool:
        """Check if request is allowed under rate limit"""
        now = datetime.now()
        window_start = now.timestamp() - self.window_seconds
        
        # Clean old requests
        self.requests[user_id] = [
            ts for ts in self.requests[user_id]
            if ts > window_start
        ]
        
        # Check limit
        if len(self.requests[user_id]) >= self.max_requests:
            return False
        
        # Record request
        self.requests[user_id].append(now.timestamp())
        return True
```

---

## 12. Continuous Improvement

### 12.1 Feedback Collection

Collect user feedback for model improvement:

```python
class FeedbackCollector:
    """Collect and store user feedback"""
    
    def record_feedback(
        self,
        session_id: str,
        query: str,
        response: str,
        rating: int,  # 1-5
        comment: str = None
    ):
        feedback = {
            "session_id": session_id,
            "query": query,
            "response": response,
            "rating": rating,
            "comment": comment,
            "timestamp": datetime.now().isoformat()
        }
        
        # Store for analysis
        self._store_feedback(feedback)
        
        # Log low ratings for immediate review
        if rating <= 2:
            app_logger.warning(f"Low rating received: {feedback}")
```

### 12.2 A/B Testing for Prompts

Implement prompt A/B testing:

```python
import random

class PromptABTest:
    """A/B test different prompt versions"""
    
    def __init__(self, variants: Dict[str, str], weights: List[float] = None):
        self.variants = variants
        self.weights = weights or [1.0] * len(variants)
        self.results = {k: {"success": 0, "total": 0} for k in variants}
    
    def get_variant(self, session_id: str) -> Tuple[str, str]:
        """Get deterministic variant for session"""
        # Use session_id for deterministic assignment
        hash_val = hash(session_id) % 100
        cumulative = 0
        total_weight = sum(self.weights)
        
        for variant_name, weight in zip(self.variants.keys(), self.weights):
            cumulative += (weight / total_weight) * 100
            if hash_val < cumulative:
                return variant_name, self.variants[variant_name]
        
        return list(self.variants.items())[0]
    
    def record_result(self, variant_name: str, success: bool):
        """Record test result"""
        self.results[variant_name]["total"] += 1
        if success:
            self.results[variant_name]["success"] += 1
    
    def get_statistics(self) -> Dict[str, float]:
        """Get success rate for each variant"""
        return {
            name: stats["success"] / max(stats["total"], 1)
            for name, stats in self.results.items()
        }
```

### 12.3 Model Performance Monitoring

Track model performance over time:

```python
class PerformanceMonitor:
    """Monitor AI model performance metrics"""
    
    def __init__(self):
        self.metrics = {
            "latency_ms": [],
            "token_usage": [],
            "tool_call_success_rate": [],
            "user_satisfaction": []
        }
    
    def record_request(
        self,
        latency_ms: float,
        tokens_used: int,
        tools_succeeded: int,
        tools_failed: int,
        user_rating: Optional[int] = None
    ):
        self.metrics["latency_ms"].append(latency_ms)
        self.metrics["token_usage"].append(tokens_used)
        
        if tools_succeeded + tools_failed > 0:
            success_rate = tools_succeeded / (tools_succeeded + tools_failed)
            self.metrics["tool_call_success_rate"].append(success_rate)
        
        if user_rating:
            self.metrics["user_satisfaction"].append(user_rating)
    
    def get_summary(self) -> Dict[str, Any]:
        """Get performance summary"""
        return {
            "avg_latency_ms": sum(self.metrics["latency_ms"]) / max(len(self.metrics["latency_ms"]), 1),
            "avg_tokens_per_request": sum(self.metrics["token_usage"]) / max(len(self.metrics["token_usage"]), 1),
            "tool_success_rate": sum(self.metrics["tool_call_success_rate"]) / max(len(self.metrics["tool_call_success_rate"]), 1),
            "avg_user_rating": sum(self.metrics["user_satisfaction"]) / max(len(self.metrics["user_satisfaction"]), 1),
            "total_requests": len(self.metrics["latency_ms"])
        }
```

---

## Quick Reference Checklist

### Before Development
- [ ] Define clear project structure
- [ ] Set up environment variable management
- [ ] Configure logging infrastructure
- [ ] Choose appropriate LLM model and provider

### During Development
- [ ] Implement tools with Pydantic schemas
- [ ] Add comprehensive error handling
- [ ] Implement caching where appropriate
- [ ] Write unit and integration tests
- [ ] Document all prompts and their purposes

### Before Deployment
- [ ] Validate all configurations
- [ ] Run security audit (no hardcoded keys)
- [ ] Set up monitoring and alerting
- [ ] Create Docker/K8s deployment configs
- [ ] Implement rate limiting

### Post-Deployment
- [ ] Monitor latency and error rates
- [ ] Track token usage and costs
- [ ] Collect user feedback
- [ ] Iterate on prompts based on data
- [ ] Regularly update dependencies

---

## References

- [LangChain Documentation](https://python.langchain.com/)
- [OpenAI API Best Practices](https://platform.openai.com/docs/guides/production-best-practices)
- [Pydantic Documentation](https://docs.pydantic.dev/)
- [Loguru Documentation](https://loguru.readthedocs.io/)

---

*Document Version: 1.0*  
*Last Updated: December 2024*  
*Based on: project1_1 - LangChain Multi-Task Q&A Assistant*
