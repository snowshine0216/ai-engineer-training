import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks
from langchain_core.messages import HumanMessage

# 导入我们的模块
from app.connection_manager import manager
from app.graph import graph
from app.models import ChatRequest

app = FastAPI()

async def run_agent_and_stream(message: str, client_id: str):
    """
    后台任务：运行 langgraph 图并将事件推送到 websocket。
    
    该函数在后台执行，不会阻塞主线程。它通过 WebSocket 实时向客户端发送状态更新和结果。
    """
    inputs = {"messages": [HumanMessage(content=message)]}
    
    print(f"开始为客户端 {client_id} 运行后台任务")
    
    # 通知开始
    await manager.send_message(client_id, {
        "type": "status",
        "content": "工作流已启动。"
    })

    # astream_events 生成图中的所有事件
    try:
        # 使用 astream_events 获取细粒度的更新 (v2 版本)
        async for event in graph.astream_events(inputs, version="v2"):
            kind = event["event"]
            
            # 识别正在运行的节点 (on_chain_start)
            if kind == "on_chain_start":
                name = event.get("name")
                if name and name in ["agent", "processor"]:
                    await manager.send_message(client_id, {
                        "type": "status",
                        "content": f"节点 '{name}' 已启动。"
                    })
            
            # 识别节点完成 (on_chain_end)
            elif kind == "on_chain_end":
                name = event.get("name")
                if name and name in ["agent", "processor"]:
                    # 检查输出，如果有部分结果则发送
                    data = event.get("data", {}).get("output")
                    if data and isinstance(data, dict) and "messages" in data:
                        last_msg = data["messages"][-1]
                        await manager.send_message(client_id, {
                            "type": "message",
                            "content": last_msg.content
                        })

            # 如果使用真实的 LLM 进行流式传输，我们将在这里处理 'on_chat_model_stream'
            elif kind == "on_chat_model_stream":
                content = event["data"]["chunk"].content
                if content:
                    await manager.send_message(client_id, {
                        "type": "token",
                        "content": content
                    })
                    
        # 最终消息：工作流完成
        await manager.send_message(client_id, {"type": "status", "content": "工作流已完成。"})
        
    except Exception as e:
        print(f"后台任务出错: {e}")
        await manager.send_message(client_id, {"type": "error", "content": str(e)})

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """
    WebSocket 端点
    处理客户端的实时连接。
    """
    await manager.connect(client_id, websocket)
    try:
        while True:
            # 保持连接活跃，可能监听客户端的取消命令等
            # 在这个演示中，我们只是接收消息但不做复杂处理
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(client_id)

@app.post("/chat")
async def chat_endpoint(request: ChatRequest, background_tasks: BackgroundTasks):
    """
    聊天 REST API 端点
    接收用户的聊天请求，触发后台任务处理，并立即返回响应。
    """
    # 1. 检查客户端是否已通过 WebSocket 连接
    if request.client_id not in manager.active_connections:
        return {"status": "error", "message": "客户端未连接到 WebSocket。请先连接到 /ws/{client_id}。"}

    # 2. 在后台调度繁重的处理任务 (运行 Agent 图)
    background_tasks.add_task(run_agent_and_stream, request.message, request.client_id)

    # 3. 返回立即确认，表明请求已接收
    return {"status": "accepted", "message": "处理已开始", "client_id": request.client_id}
