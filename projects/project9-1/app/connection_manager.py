from typing import Dict
from fastapi import WebSocket

class ConnectionManager:
    """
    WebSocket 连接管理器
    用于管理所有活跃的 WebSocket 连接，包括连接、断开连接和发送消息。
    """
    def __init__(self):
        # 映射 client_id -> WebSocket 连接对象
        # 用于存储当前活跃的连接，以便可以通过 client_id 找到对应的 WebSocket 对象
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, client_id: str, websocket: WebSocket):
        """
        处理新的 WebSocket 连接
        :param client_id: 客户端唯一标识
        :param websocket: WebSocket 连接对象
        """
        await websocket.accept()
        self.active_connections[client_id] = websocket
        print(f"客户端 {client_id} 已连接。")

    def disconnect(self, client_id: str):
        """
        断开 WebSocket 连接
        :param client_id: 客户端唯一标识
        """
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            print(f"客户端 {client_id} 已断开连接。")

    async def send_message(self, client_id: str, message: dict):
        """
        向指定客户端发送 JSON 消息
        :param client_id: 目标客户端唯一标识
        :param message: 要发送的消息字典
        """
        if client_id in self.active_connections:
            await self.active_connections[client_id].send_json(message)

# 全局连接管理器实例
manager = ConnectionManager()
