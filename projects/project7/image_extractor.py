import os
from typing import Dict, Any, List
from langchain_community.chat_models import ChatTongyi
from langchain_core.messages import HumanMessage
from utils import encode_image

class ImageContentExtractor:
    """
    负责利用多模态模型 (Qwen-VL) 提取图片中的详细信息。
    """
    def __init__(self, api_key: str):
        self.api_key = api_key
        # 使用 Qwen-VL-Max 以获得更好的 OCR 和细节识别能力
        self.llm = ChatTongyi(
            model_name="qwen-vl-max",
            dashscope_api_key=api_key,
            temperature=0.1
        )

    def extract(self, image_path: str) -> str:
        """
        分析图片并返回详细的文本描述。
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found: {image_path}")

        print(f"正在分析图片内容: {image_path} ...")
        
        image_b64 = encode_image(image_path)
        image_data = f"data:image/png;base64,{image_b64}"
        
        # Prompt 设计：要求模型尽可能详细地提取信息，以便后续检索
        prompt = """
        请仔细阅读并分析这张图片。
        1. 如果是文档或票据，请提取所有可见的键值对信息（如标题、日期、金额、人数、规格等）。
        2. 如果是场景图，请详细描述场景中的物体、位置和关系。
        3. 请直接输出提取的信息，不需要开场白。
        """
        
        msg = HumanMessage(content=[
            {"type": "text", "text": prompt},
            {"type": "image", "image": image_data}
        ])

        try:
            response = self.llm.invoke([msg])
            content = response.content
            
            # 处理多模态返回可能为 list 的情况
            if isinstance(content, list):
                text_parts = []
                for item in content:
                    if isinstance(item, dict) and 'text' in item:
                        text_parts.append(item['text'])
                    elif isinstance(item, str):
                        text_parts.append(item)
                content = "\n".join(text_parts)
            
            print("图片内容提取完成。")
            return str(content)
        except Exception as e:
            print(f"提取失败: {e}")
            return ""
