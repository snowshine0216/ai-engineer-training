import os
import dotenv
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import DashScopeEmbeddings
from langchain_community.vectorstores import FAISS

dotenv.load_dotenv()

embeddings = DashScopeEmbeddings(
    model="text-embedding-v4", dashscope_api_key=os.getenv("DASHSCOPE_API_KEY")
)

# Load and chunk contents of the blog
loader = TextLoader("./data.txt", encoding="utf-8")
docs = loader.load()

text_splitter = RecursiveCharacterTextSplitter(separators=["\n\n", "\n", " ", ""], chunk_size=100, chunk_overlap=50)
all_splits = text_splitter.split_documents(docs)

vector_store = FAISS.from_documents(all_splits, embeddings)

# 持久化向量数据库
vector_store.save_local("faiss_index")
