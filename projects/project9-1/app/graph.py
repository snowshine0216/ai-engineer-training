import asyncio
import operator
from typing import TypedDict, Annotated, List
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langgraph.graph import StateGraph, END

# 1. 定义状态 (State)
# AgentState 定义了工作流中传递的数据结构
class AgentState(TypedDict):
    # messages 列表存储对话历史
    # operator.add 表示当新消息到达时，将其追加到现有列表中，而不是覆盖
    messages: Annotated[List[BaseMessage], operator.add]

# 2. 定义节点 (Node) (模拟 LLM)
# 这是一个处理节点，接收当前状态，并返回新的状态更新
async def call_model(state: AgentState):
    """
    模拟调用大语言模型 (LLM) 的节点。
    """
    # 模拟处理时间
    await asyncio.sleep(1)
    
    # 使用 FakeListChatModel 模拟 LLM 响应
    # 在实际场景中，这里会是 ChatOpenAI 或其他真实模型
    responses = [
        "我已收到您的请求。",
        "正在分析数据...",
        "这是基于您输入生成的最终结果。"
    ]
    model = FakeListChatModel(responses=responses)
    
    # 我们调用模型。在实际应用中，如果我们要手动处理流式传输，
    # 我们可能会在节点内部使用 astream。
    # 但在这里我们依赖于 graph 的 astream_events。
    # FakeListChatModel 每次 invoke 只会返回列表中的一个响应。
    # 为了模拟逐个 token 的 "流式传输"，我们依赖模型的实现。
    # FakeListChatModel 在某些版本中默认流式支持可能有限，
    # 所以我们可能只看到节点完成事件。
    # 为了更好的演示效果，我们只返回一个静态消息，但我们将追踪图的执行事件。
    
    response = await model.ainvoke(state["messages"])
    # 返回更新的状态，这里是添加新的 AI 消息
    return {"messages": [response]}

async def process_data(state: AgentState):
    """
    模拟数据处理节点。
    """
    await asyncio.sleep(1)
    return {"messages": [AIMessage(content="数据处理完成。")]}

# 3. 构建图 (Graph)
# 初始化状态图
workflow = StateGraph(AgentState)

# 添加节点
workflow.add_node("agent", call_model)
workflow.add_node("processor", process_data)

# 设置入口点：图执行的起始节点
workflow.set_entry_point("agent")

# 添加边：定义节点之间的流向
workflow.add_edge("agent", "processor") # agent 完成后流向 processor
workflow.add_edge("processor", END)     # processor 完成后结束

# 编译图，生成可执行的 Runnable
graph = workflow.compile()
