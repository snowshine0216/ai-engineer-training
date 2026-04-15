import argparse
import os
import sys
from typing import Optional

from config_manager import ConfigManager
from vector_store_manager import SimpleVectorStore
from image_extractor import ImageContentExtractor
from langchain_community.chat_models import ChatTongyi
from langchain_core.prompts import ChatPromptTemplate

def main():
    parser = argparse.ArgumentParser(description="多模态 RAG 系统")
    parser.add_argument("-i", "--image", help="图片路径 (用于入库)")
    parser.add_argument("-q", "--query", help="查询问题")
    parser.add_argument("--ingest", action="store_true", help="是否执行入库操作")
    
    args = parser.parse_args()
    
    # 1. 初始化配置
    config = ConfigManager()
    api_key = config.get_api_key()
    if not api_key:
        print("错误: 未找到 API Key，请在 config.yaml 或环境变量中设置。")
        return

    # 2. 初始化组件
    vector_store = SimpleVectorStore(api_key=api_key)
    
    # 3. 流程 A: 图片入库 (Ingest)
    if args.ingest and args.image:
        print(f"=== 开始处理图片入库: {args.image} ===")
        extractor = ImageContentExtractor(api_key)
        
        # Step 1: 提取文本
        description = extractor.extract(args.image)
        if description:
            print(f"\n[提取结果]:\n{description[:200]}...\n")
            
            # Step 2: 存入向量库
            # 将图片路径作为元数据保存，方便追溯
            vector_store.add_texts(
                texts=[description], 
                metadatas=[{"source": args.image, "type": "image_description"}]
            )
            print("=== 入库完成 ===")
        else:
            print("提取内容为空，跳过入库。")

    # 4. 流程 B: RAG 检索与问答 (Retrieval & Generation)
    if args.query:
        print(f"\n=== 开始回答问题: {args.query} ===")
        
        # Step 1: 向量检索
        results = vector_store.similarity_search(args.query, k=2)
        
        if not results:
            print("未在知识库中找到相关信息。")
            return
            
        print(f"检索到 {len(results)} 条相关上下文。")
        
        # Step 2: 构建上下文
        context_str = ""
        for i, res in enumerate(results, 1):
            context_str += f"--- 上下文 {i} (来源: {res['metadata'].get('source')}) ---\n{res['content']}\n\n"
            
        # Step 3: LLM 生成回答
        chat_model = ChatTongyi(
            model_name="qwen-max", # 使用更强的纯文本模型进行推理
            dashscope_api_key=api_key
        )
        
        prompt = ChatPromptTemplate.from_template("""
        你是一个智能助手。请基于下面的检索到的上下文信息回答用户的问题。
        如果上下文中没有答案，请诚实地说不知道。
        
        相关上下文：
        {context}
        
        用户问题：{question}
        """)
        
        chain = prompt | chat_model
        
        response = chain.invoke({"context": context_str, "question": args.query})
        
        print("\n[最终回答]:")
        print(response.content)

if __name__ == "__main__":
    main()
