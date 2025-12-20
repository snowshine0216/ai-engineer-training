import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, List
from llama_index.core import VectorStoreIndex, Settings
from llama_index.core.node_parser import SentenceWindowNodeParser
from llama_index.core.postprocessor import MetadataReplacementPostProcessor

# Path to evaluation data
EVALUATION_DATA_PATH = Path(__file__).parent.parent / "data" / "evaluation.json"


@dataclass
class EvaluationItem:
    """Data class for a single Q&A evaluation item"""
    question: str
    ground_truth: str


@dataclass
class EvaluationResult:
    """Data class for storing evaluation results"""
    splitter_name: str
    question: str = ""                     # The question being evaluated
    chunk_size: Optional[int] = None
    chunk_overlap: Optional[int] = None
    window_size: Optional[int] = None

    # Retrieval evaluation metrics
    context_contains_answer: bool = False  # Whether retrieved context contains the answer
    num_chunks_retrieved: int = 0          # Number of chunks retrieved

    # Generation quality evaluation
    answer_accuracy: int = 0               # Answer accuracy (1-5)
    answer_completeness: int = 0           # Answer completeness (1-5)
    context_redundancy: int = 0            # Context redundancy level (1-5, 5=very redundant)

    # LLM generated answer
    generated_answer: str = ""
    retrieved_context: str = ""


def load_evaluation_data(file_path: Path = EVALUATION_DATA_PATH) -> List[EvaluationItem]:
    """
    Load evaluation questions and ground truth answers from JSON file.

    Args:
        file_path: Path to the evaluation JSON file

    Returns:
        List of EvaluationItem objects containing questions and answers
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    items = []
    for item in data.get('items', []):
        items.append(EvaluationItem(
            question=item['question'],
            ground_truth=item['answer']
        ))

    print(f"Loaded {len(items)} evaluation items from {file_path}")
    return items


def evaluate_splitter(splitter, documents, question, ground_truth, name) -> EvaluationResult:
    """
    Evaluate the effectiveness of different text splitters.

    Args:
        splitter: Splitter instance (SentenceSplitter, TokenTextSplitter, SentenceWindowNodeParser, etc.)
        documents: List of documents
        question: Test question
        ground_truth: Ground truth answer
        name: Name of the splitter

    Returns:
        EvaluationResult: Evaluation results
    """
    result = EvaluationResult(splitter_name=name, question=question[:50] + "..." if len(question) > 50 else question)

    # 1. Process documents using the splitter
    nodes = splitter.get_nodes_from_documents(documents)

    # Record splitter parameters
    if hasattr(splitter, 'chunk_size'):
        result.chunk_size = splitter.chunk_size
    if hasattr(splitter, 'chunk_overlap'):
        result.chunk_overlap = splitter.chunk_overlap
    if hasattr(splitter, 'window_size'):
        result.window_size = splitter.window_size

    # 2. Build index
    index = VectorStoreIndex(nodes)

    # 3. Configure query engine (sentence window requires special postprocessor)
    if isinstance(splitter, SentenceWindowNodeParser):
        query_engine = index.as_query_engine(
            similarity_top_k=5,
            node_postprocessors=[
                MetadataReplacementPostProcessor(target_metadata_key="window")
            ]
        )
    else:
        query_engine = index.as_query_engine(similarity_top_k=5)

    # 4. Perform retrieval and get source nodes
    retriever = index.as_retriever(similarity_top_k=5)
    retrieved_nodes = retriever.retrieve(question)
    result.num_chunks_retrieved = len(retrieved_nodes)

    # Combine retrieved contexts
    contexts = [node.get_content() for node in retrieved_nodes]
    result.retrieved_context = "\n---\n".join(contexts)

    # 5. Check if context contains the answer (simple string matching)
    result.context_contains_answer = ground_truth.lower() in result.retrieved_context.lower()

    # 6. Generate answer using LLM
    response = query_engine.query(question)
    result.generated_answer = str(response)

    # 7. Use LLM to evaluate answer quality
    evaluation_prompt = f"""
    Please evaluate the quality of the following Q&A using a 1-5 scale:
    
    Question: {question}
    Ground Truth: {ground_truth}
    Generated Answer: {result.generated_answer}
    Retrieved Context: {result.retrieved_context[:2000]}...
    
    Return the scores in JSON format:
    {{
        "accuracy": <1-5, how accurate the answer is compared to ground truth>,
        "completeness": <1-5, how complete the answer is>,
        "redundancy": <1-5, ratio of irrelevant info in context, 5=very redundant>
    }}
    """

    eval_response = Settings.llm.complete(evaluation_prompt)

    # Parse evaluation results (simplified, needs more robust parsing in production)
    try:
        import json
        import re
        json_match = re.search(r'\{.*\}', str(eval_response), re.DOTALL)
        if json_match:
            scores = json.loads(json_match.group())
            result.answer_accuracy = scores.get("accuracy", 0)
            result.answer_completeness = scores.get("completeness", 0)
            result.context_redundancy = scores.get("redundancy", 0)
    except (json.JSONDecodeError, AttributeError):
        print(f"Warning: Failed to parse evaluation results for {name}")

    # 8. Print result summary
    print(f"\n{'='*50}")
    print(f"Splitter: {name}")
    print(f"Chunk Size: {result.chunk_size}, Overlap: {result.chunk_overlap}")
    print(f"Retrieved {result.num_chunks_retrieved} chunks")
    print(f"Context Contains Answer: {'✓' if result.context_contains_answer else '✗'}")
    print(f"Accuracy: {result.answer_accuracy}/5")
    print(f"Completeness: {result.answer_completeness}/5")
    print(f"Redundancy: {result.context_redundancy}/5")
    print(f"{'='*50}")

    return result


def run_comparison_experiments(documents, evaluation_items: List[EvaluationItem] = None):
    """
    Run comparison experiments using evaluation items from JSON file.

    Args:
        documents: List of documents to process
        evaluation_items: Optional list of EvaluationItem objects.
                         If None, loads from default evaluation.json path.

    Returns:
        List of EvaluationResult objects
    """
    from llama_index.core.node_parser import SentenceSplitter, TokenTextSplitter

    # Load evaluation data if not provided
    if evaluation_items is None:
        evaluation_items = load_evaluation_data()

    results = []

    # Define splitter configurations
    splitter_configs = []

    # Experiment 1: Different chunk_size values
    for chunk_size in [256, 512, 1024]:
        splitter_configs.append((
            SentenceSplitter(chunk_size=chunk_size, chunk_overlap=50),
            f"Sentence (size={chunk_size})"
        ))

    # Experiment 2: Different chunk_overlap values
    for overlap in [0, 50, 100, 200]:
        splitter_configs.append((
            SentenceSplitter(chunk_size=512, chunk_overlap=overlap),
            f"Sentence (overlap={overlap})"
        ))

    # Experiment 3: Different window_size values (sentence window)
    for window_size in [1, 3, 5]:
        splitter_configs.append((
            SentenceWindowNodeParser.from_defaults(
                window_size=window_size,
                window_metadata_key="window",
                original_text_metadata_key="original_text"
            ),
            f"SentenceWindow (window={window_size})"
        ))

    # Experiment 4: TokenTextSplitter with different chunk sizes
    for chunk_size in [32, 64, 128, 256]:
        splitter_configs.append((
            TokenTextSplitter(
                chunk_size=chunk_size,
                chunk_overlap=chunk_size // 8,  # 12.5% overlap
                separator="\n"
            ),
            f"Token (size={chunk_size})"
        ))

    # Experiment 5: TokenTextSplitter with different overlap ratios
    for overlap_ratio in [0, 0.1, 0.25, 0.5]:
        chunk_size = 128
        overlap = int(chunk_size * overlap_ratio)
        splitter_configs.append((
            TokenTextSplitter(
                chunk_size=chunk_size,
                chunk_overlap=overlap,
                separator="\n"
            ),
            f"Token (overlap={overlap_ratio*100:.0f}%)"
        ))

    # Run experiments for each splitter and each evaluation item
    total_experiments = len(splitter_configs) * len(evaluation_items)
    current = 0

    for splitter, name in splitter_configs:
        for eval_item in evaluation_items:
            current += 1
            print(f"\n[{current}/{total_experiments}] Running: {name}")
            print(f"Question: {eval_item.question[:80]}...")

            result = evaluate_splitter(
                splitter, documents,
                eval_item.question,
                eval_item.ground_truth,
                name
            )
            results.append(result)

    return results


def run_single_experiment(documents, question: str, ground_truth: str):
    """
    Run comparison experiments with a single question (legacy interface).

    Args:
        documents: List of documents to process
        question: Test question
        ground_truth: Ground truth answer

    Returns:
        List of EvaluationResult objects
    """
    eval_item = EvaluationItem(question=question, ground_truth=ground_truth)
    return run_comparison_experiments(documents, [eval_item])


def generate_comparison_table(results: list[EvaluationResult]) -> str:
    """Generate a Markdown comparison table"""
    table = "| Splitter | Chunk Size | Overlap | Contains Answer | Accuracy | Completeness | Redundancy |\n"
    table += "|----------|------------|---------|-----------------|----------|--------------|------------|\n"

    for r in results:
        contains = "✓" if r.context_contains_answer else "✗"
        table += f"| {r.splitter_name} | {r.chunk_size or 'N/A'} | {r.chunk_overlap or 'N/A'} | {contains} | {r.answer_accuracy}/5 | {r.answer_completeness}/5 | {r.context_redundancy}/5 |\n"

    return table
