import asyncio
import websockets
import httpx
import json

CLIENT_ID = "user_test_001"
WS_URL = f"ws://localhost:8000/ws/{CLIENT_ID}"
API_URL = "http://localhost:8000/chat"

async def listen_to_ws():
    async with websockets.connect(WS_URL) as websocket:
        print(f" 已连接到 WebSocket，ID 为 {CLIENT_ID}")
        
        # 连接建立后，触发 HTTP 请求
        print(" 正在发送 HTTP 请求以开始任务...")
        async with httpx.AsyncClient() as client:
            response = await client.post(
                API_URL,
                json={"message": "Start the analysis", "client_id": CLIENT_ID}
            )
            print(f" HTTP 响应: {response.json()}")

        print(" 正在监听更新...")
        while True:
            try:
                message = await websocket.recv()
                data = json.loads(message)
                print(f"   [WS 接收] 类型: {data.get('type'):<10} | 内容: {data.get('content')}")
                
                if data.get("content") == "Workflow completed.":
                    print(" 工作流完成。正在退出。")
                    break
            except websockets.exceptions.ConnectionClosed:
                print(" 连接已关闭")
                break

if __name__ == "__main__":
    # 确保已安装依赖：pip install websockets httpx
    try:
        asyncio.run(listen_to_ws())
    except KeyboardInterrupt:
        print("已停止。")
