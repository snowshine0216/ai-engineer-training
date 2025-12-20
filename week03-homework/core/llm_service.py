import os
from pathlib import Path
from llama_index.llms.openai_like import OpenAILike
from llama_index.llms.azure_openai import AzureOpenAI
from llama_index.embeddings.dashscope import DashScopeEmbedding, DashScopeTextEmbeddingModels
from llama_index.embeddings.azure_openai import AzureOpenAIEmbedding
from dotenv import load_dotenv

# Load .env from the week03-homework directory
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)


QWLLM = OpenAILike(
    model="qwen-plus",
    api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    is_chat_model=True
)


# AzureLLM = AzureOpenAI(
#     engine="gpt-4o",
#     api_key=os.getenv("AZURE_API_KEY"),
#     azure_endpoint=os.getenv("AZURE_API_BASE"),
#     api_version=os.getenv("AZURE_API_VERSION"),
#     model=os.getenv("AZURE_MODEL"),
#     temperature=0.0,
# )


QWEMBeddingModel = DashScopeEmbedding(
    model_name=DashScopeTextEmbeddingModels.TEXT_EMBEDDING_V3,
    embed_batch_size=6,
    embed_input_length=8192
)

# AzureEMBeddingModel = AzureOpenAIEmbedding(
#     api_key=os.getenv("AZURE_API_KEY"),
#     api_base=os.getenv("AZURE_API_BASE"),
#     api_version=os.getenv("AZURE_API_VERSION"),
#     model=os.getenv("AZURE_EMBEDDING_MODEL"),
#     is_chat_model=True
# )
