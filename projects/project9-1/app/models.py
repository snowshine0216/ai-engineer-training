from pydantic import BaseModel

class ChatRequest(BaseModel):
    """
    聊天请求模型
    用于定义 /chat 端点的请求体结构。
    """
    # 用户输入的消息内容
    message: str
    # 客户端唯一标识，用于关联 WebSocket 连接
    client_id: str
