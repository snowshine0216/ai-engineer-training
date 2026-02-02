import json
import os
import numpy as np
from typing import List, Dict, Any, Optional
from langchain_core.embeddings import Embeddings
from langchain_community.embeddings import DashScopeEmbeddings

class SimpleVectorStore:
    """
    一个极简的本地向量数据库实现。
    使用 JSON 保存数据，numpy 计算余弦相似度。
    """
    def __init__(self, file_path: str = "vector_memory.json", api_key: Optional[str] = None):
        self.file_path = file_path
        self.embeddings = DashScopeEmbeddings(
            model="text-embedding-v1", 
            dashscope_api_key=api_key
        )
        self.data: List[Dict[str, Any]] = []
        self.vectors: Optional[np.ndarray] = None
        self.load()

    def load(self):
        """从本地文件加载数据"""
        if os.path.exists(self.file_path):
            try:
                with open(self.file_path, 'r', encoding='utf-8') as f:
                    saved_data = json.load(f)
                    self.data = saved_data
                    # 重建向量索引
                    if self.data:
                        vectors = [item['vector'] for item in self.data]
                        self.vectors = np.array(vectors)
            except Exception as e:
                print(f"Error loading vector store: {e}")
                self.data = []
                self.vectors = None

    def save(self):
        """保存数据到本地文件"""
        with open(self.file_path, 'w', encoding='utf-8') as f:
            json.dump(self.data, f, ensure_ascii=False)

    def add_texts(self, texts: List[str], metadatas: List[Dict[str, Any]] = None):
        """添加文本到向量库"""
        if not texts:
            return
        
        # 1. 生成向量
        embeddings = self.embeddings.embed_documents(texts)
        
        # 2. 更新内存数据
        if metadatas is None:
            metadatas = [{} for _ in texts]
            
        new_items = []
        for text, emb, meta in zip(texts, embeddings, metadatas):
            item = {
                "text": text,
                "vector": emb,
                "metadata": meta or {}
            }
            new_items.append(item)
            self.data.append(item)
            
        # 3. 更新 numpy 数组
        new_vectors = np.array(embeddings)
        if self.vectors is None:
            self.vectors = new_vectors
        else:
            self.vectors = np.vstack([self.vectors, new_vectors])
            
        # 4. 持久化
        self.save()
        print(f"已存入 {len(texts)} 条数据到向量库。")

    def similarity_search(self, query: str, k: int = 3) -> List[Dict[str, Any]]:
        """
        基于 Query 进行向量检索
        """
        if self.vectors is None or len(self.data) == 0:
            return []

        # 1. Query 向量化
        query_embedding = self.embeddings.embed_query(query)
        query_vec = np.array(query_embedding)

        # 2. 计算余弦相似度 (Cosine Similarity)
        # Cosine = (A . B) / (||A|| * ||B||)
        norm_vectors = np.linalg.norm(self.vectors, axis=1)
        norm_query = np.linalg.norm(query_vec)
        
        if norm_query == 0:
            return []
            
        # 避免除以零
        norm_vectors[norm_vectors == 0] = 1e-10
        
        scores = np.dot(self.vectors, query_vec) / (norm_vectors * norm_query)
        
        # 3. 获取 Top K
        # argsort 返回的是从小到大的索引，所以取最后 k 个并反转
        top_k_indices = np.argsort(scores)[-k:][::-1]
        
        results = []
        for idx in top_k_indices:
            item = self.data[idx]
            results.append({
                "content": item['text'],
                "metadata": item['metadata'],
                "score": float(scores[idx])
            })
            
        return results
