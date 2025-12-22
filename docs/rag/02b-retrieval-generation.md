# RAG System Components: Retrieval and Generation

This document covers the retrieval and generation components of a production RAG system, including retrieval mechanisms, reranking, and context-aware generation.

## Table of Contents

1. [Retrieval Mechanisms](#retrieval-mechanisms)
2. [Reranking](#reranking)
3. [Generation with Context](#generation-with-context)

---

## Retrieval Mechanisms

### Overview

Retrieval mechanisms find relevant chunks for a given query.

### Retrieval Types

| Type | Description | Strengths |
|------|-------------|-----------|
| Dense | Semantic similarity via embeddings | Semantic understanding |
| Sparse | Keyword matching (BM25, TF-IDF) | Exact match, rare terms |
| Hybrid | Combination of dense and sparse | Best of both approaches |

### Advanced Techniques

- **Query Expansion**: Adding synonyms or related terms
- **Query Decomposition**: Breaking complex queries into sub-queries
- **HyDE**: Hypothetical Document Embeddings
- **Multi-query**: Generating multiple query variations
- **Parent-child Retrieval**: Retrieving context around matched chunks

### Implementation Practices

#### Hybrid Retrieval Architecture

Implement a two-stage retrieval that combines vector search (Milvus/FAISS) with keyword search (Elasticsearch):

```python
# Stage 1: Vector retrieval (semantic understanding)
milvus_docs = await vectorstore.similarity_search(query, k=top_k, filter=expr)
for doc in milvus_docs:
    doc.metadata['retrieval_source'] = 'milvus'

# Stage 2: Keyword retrieval (precise matching)
es_filter = [{"terms": {"metadata.kb_id.keyword": partition_keys}}]
es_docs = await es_store.asimilarity_search(query, k=top_k, filter=es_filter)

# Deduplicate and merge results
milvus_doc_ids = {d.metadata['doc_id'] for d in milvus_docs}
unique_es_docs = [d for d in es_docs if d.metadata['doc_id'] not in milvus_doc_ids]
merged_docs = milvus_docs + unique_es_docs
```

> [!TIP]
> Vector retrieval excels at semantic similarity (synonyms, concepts), while keyword retrieval catches precise matches (proper nouns, codes, numbers). Combining both significantly improves recall without hurting precision.

#### RRF Score Fusion for Hybrid Results

When merging results from multiple retrievers, use **Reciprocal Rank Fusion (RRF)** to normalize scores:

```python
def fuse_results(results_dict, similarity_top_k: int = 2):
    """Fuse results using Reciprocal Rank Fusion (RRF)."""
    k = 60.0  # RRF constant - higher values give more weight to lower ranks
    fused_scores = {}
    text_to_node = {}

    for nodes_with_scores in results_dict.values():
        for rank, node in enumerate(
            sorted(nodes_with_scores, key=lambda x: x.score or 0.0, reverse=True)
        ):
            text = node.node.get_content()
            text_to_node[text] = node
            if text not in fused_scores:
                fused_scores[text] = 0.0
            fused_scores[text] += 1.0 / (rank + k)

    # Sort by fused score and return top results
    reranked = sorted(fused_scores.items(), key=lambda x: x[1], reverse=True)
    return [text_to_node[text] for text, _ in reranked[:similarity_top_k]]
```

#### Query Rewriting for Multi-turn Conversations

For conversational RAG, rewrite queries to incorporate chat history context:

```python
if chat_history:
    formatted_history = [
        HumanMessage(content=msg[0]),
        AIMessage(content=msg[1])
    ] for msg in chat_history]
    
    rewrite_chain = RewriteQuestionChain(model_name=model)
    condense_question = await rewrite_chain.condense_q_chain.ainvoke({
        "chat_history": formatted_history,
        "question": query,
    })
    
    # Use rewritten query for retrieval if significantly different
    if normalize(condense_question) != normalize(query):
        retrieval_query = condense_question
```

#### Parent-Child Document Strategy

Store small chunks for retrieval but return parent documents for context:

```python
# Child splitter: small chunks for precise retrieval
child_splitter = RecursiveCharacterTextSplitter(
    chunk_size=DEFAULT_CHILD_CHUNK_SIZE,  # e.g., 256 tokens
    chunk_overlap=int(DEFAULT_CHILD_CHUNK_SIZE / 4),  # 25% overlap
    length_function=num_tokens_embed
)

# Parent splitter: larger chunks for context
parent_splitter = RecursiveCharacterTextSplitter(
    chunk_size=DEFAULT_PARENT_CHUNK_SIZE,  # e.g., 512 tokens
    chunk_overlap=0,  # No overlap to avoid redundancy
    length_function=num_tokens_embed
)

# Retrieval: search child, return parent
sub_docs = await vectorstore.similarity_search(query)
parent_ids = [doc.metadata['parent_id'] for doc in sub_docs]
parent_docs = await docstore.get(parent_ids)
```

#### Similarity Cutoff Post-processing

Apply post-processing filters to remove low-quality matches:

```python
from llama_index.core.postprocessor import SimilarityPostprocessor

# Filter chunks below similarity threshold
similarity_postprocessor = SimilarityPostprocessor(similarity_cutoff=0.7)
filtered_nodes = similarity_postprocessor.postprocess_nodes(retrieved_nodes)
```

---

## Reranking

### Overview

Reranking re-orders initial retrieval results using more sophisticated models.

### Why Reranking?

- Initial retrieval prioritizes speed (bi-encoder)
- Reranking prioritizes quality (cross-encoder)
- Two-stage approach balances speed and accuracy

### Reranking Approaches

| Approach | Description | Trade-offs |
|----------|-------------|------------|
| Cross-encoder | Deep attention between query and document | High quality, slower |
| LLM-based | Use LLM to score relevance | Flexible, expensive |
| Learned reranking | Trained on domain data | Domain-specific |

### Popular Rerankers

- Cohere Rerank
- BGE Reranker
- Cross-encoder models (ms-marco)
- ColBERT

### Implementation Practices

#### Two-Layer Filtering Strategy

Apply two complementary filtering layers after reranking to ensure document quality:

```python
if rerank and len(source_documents) > 1 and num_tokens(query) <= 300:
    # Execute reranking
    source_documents = await reranker.rerank_documents(query, source_documents)
    
    # Layer 1: Absolute score threshold (0.28 empirical threshold)
    # Purpose: Filter obviously irrelevant documents
    # Rationale: Relevant docs typically score > 0.4, irrelevant < 0.3
    filtered_docs = [doc for doc in source_documents if doc.metadata['score'] >= 0.28]
    if filtered_docs:
        source_documents = filtered_docs
    
    # Layer 2: Relative score difference (50% threshold)
    # Purpose: Detect quality cliffs between consecutive documents
    saved_docs = [source_documents[0]]  # Always keep highest-scoring doc
    for doc in source_documents[1:]:
        relative_diff = (saved_docs[0].metadata['score'] - doc.metadata['score']) / saved_docs[0].metadata['score']
        if relative_diff > 0.5:
            break  # Quality dropped too much, stop adding
        saved_docs.append(doc)
    source_documents = saved_docs
```

> [!IMPORTANT]
> **Why two layers?**
> - **Absolute threshold**: Ensures baseline quality regardless of query
> - **Relative threshold**: Adapts to score distribution; prevents including documents that are significantly worse than the best match

#### Long Document Handling with Sliding Window

For documents exceeding the reranker's max length, use sliding window with overlap:

```python
overlap_tokens = 80
max_passage_length = max_length - query_length - 2

if passage_length <= max_passage_length:
    # Short passage: process normally
    merge_inputs.append(merge_query_passage(query, passage))
else:
    # Long passage: sliding window with overlap
    start_id = 0
    while start_id < passage_length:
        end_id = start_id + max_passage_length
        sub_passage = passage_tokens[start_id:end_id]
        merge_inputs.append(merge_query_passage(query, sub_passage))
        
        # Use max score across all windows for this document
        start_id = end_id - overlap_tokens if end_id < passage_length else end_id

# Aggregate scores: take max across all windows for each document
for pid, score in zip(passage_indices, scores):
    final_scores[pid] = max(final_scores[pid], score)
```

#### Async Batch Processing for Reranking

Optimize reranking throughput with async batch processing:

```python
class RerankAsyncBackend:
    def __init__(self, batch_size=32):
        self.queue = asyncio.Queue()
        self.batch_size = batch_size
        asyncio.create_task(self.process_queue())
    
    async def get_rerank_async(self, query: str, passages: List[str]):
        # Tokenize and prepare batches
        batches, passage_indices = self.tokenize_preproc(query, passages)
        
        # Submit to async queue
        futures = []
        for batch in batches:
            future = asyncio.Future()
            futures.append(future)
            await self.queue.put((batch, future))
        
        # Gather results
        results = await asyncio.gather(*futures)
        return self.merge_scores(results, passage_indices)
    
    async def process_queue(self):
        """Continuously process batched inference requests."""
        while True:
            batch_items = []
            futures = []
            
            # Collect items up to batch_size
            while len(batch_items) < self.batch_size:
                try:
                    batch, future = await asyncio.wait_for(
                        self.queue.get(), timeout=0.01
                    )
                    batch_items.extend(batch)
                    futures.append((future, len(batch)))
                except asyncio.TimeoutError:
                    break
            
            if batch_items:
                # Run inference
                scores = await self.run_inference(batch_items)
                # Distribute results back to futures
                self.distribute_results(scores, futures)
```

#### Score Normalization with Sigmoid

Normalize reranker logits to [0, 1] range with score adjustment:

```python
def sigmoid_normalize(logits):
    """Apply sigmoid with score adjustment for better calibration."""
    logits = logits.astype('float32')
    scores = 1 / (1 + np.exp(-logits))
    # Stretch scores: emphasize differences in the middle range
    scores = np.clip(1.5 * (scores - 0.5) + 0.5, 0, 1)
    return scores
```

---

## Generation with Context

### Overview

The generation stage uses retrieved context to produce the final response.

### Key Aspects

- **Context Formatting**: How retrieved chunks are presented to the LLM
- **Prompt Engineering**: Instructions for using context effectively
- **Citation Integration**: Attributing generated content to sources
- **Response Synthesis**: Combining multiple pieces of information

### Prompt Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| Stuff | Include all context in one prompt | Small context |
| Map-reduce | Process chunks separately, then combine | Large context |
| Refine | Iteratively refine answer with each chunk | Sequential logic |
| Tree | Hierarchical summarization | Very large documents |

### Implementation Practices

#### Token-Aware Context Selection

Implement greedy token budget allocation to maximize context within LLM limits:

```python
def reprocess_source_documents(self, llm, query, source_docs, history, template):
    # Calculate fixed token costs
    query_tokens = llm.num_tokens(query) * 4  # Safety margin for encoding
    history_tokens = llm.num_tokens(str(history))
    template_tokens = llm.num_tokens(template)
    reference_tokens = llm.num_tokens(
        [f"<reference>[{i+1}]</reference>" for i in range(len(source_docs))]
    )
    
    # Calculate available token budget for documents
    available_tokens = (
        llm.token_window 
        - llm.max_output_tokens 
        - llm.safety_buffer
        - query_tokens 
        - history_tokens 
        - template_tokens 
        - reference_tokens
    )
    
    # Greedy selection: add documents until budget exhausted
    selected_docs = []
    total_tokens = 0
    seen_file_ids = set()
    
    for doc in source_docs:
        # Count header tokens only once per file
        header_tokens = 0
        if doc.metadata['file_id'] not in seen_file_ids:
            seen_file_ids.add(doc.metadata['file_id'])
            if 'headers' in doc.metadata:
                header_tokens = llm.num_tokens(doc.metadata['headers'])
        
        # Remove image references for token counting
        content = re.sub(r'!\[figure\]\(.*?\)', '', doc.page_content)
        doc_tokens = llm.num_tokens(content) + header_tokens
        
        if total_tokens + doc_tokens <= available_tokens:
            selected_docs.append(doc)
            total_tokens += doc_tokens
        else:
            break  # Budget exhausted
    
    return selected_docs, available_tokens
```

> [!WARNING]
> Always account for:
> - Encoding differences between tokenizers (use 4x safety margin for queries)
> - Header metadata that should only be counted once per file
> - Image reference placeholders that don't contribute to semantic content

#### Structured Reference Format

Format context with clear document boundaries and citations:

```python
def generate_prompt(self, query, source_docs, template):
    context = ''
    seen_file_ids = []
    
    for doc in source_docs:
        content = re.sub(r'!\[figure\]\(.*?\)', '', doc.page_content)
        file_id = doc.metadata['file_id']
        
        if file_id not in seen_file_ids:
            # Close previous reference tag
            if seen_file_ids:
                context += '</reference>\n'
            
            seen_file_ids.append(file_id)
            
            # Open new reference with headers if available
            if 'headers' in doc.metadata:
                context += f"<reference headers={doc.metadata['headers']}>[{len(seen_file_ids)}]\n"
            else:
                context += f"<reference>[{len(seen_file_ids)}]\n"
            context += content + '\n'
        else:
            # Same file: append content without new reference tag
            context += content + '\n'
    
    context += '</reference>\n'
    
    return template.replace("{{context}}", context).replace("{{question}}", query)
```

#### Streaming Response with Metrics

Implement streaming generation with comprehensive metrics tracking:

```python
async def generate_answer(self, prompt, history, streaming=True):
    has_first_token = False
    accumulated_response = ''
    start_time = time.perf_counter()
    
    async for chunk in llm.stream_generate(prompt, history=history):
        response_text = chunk.llm_output["answer"]
        accumulated_response += extract_content(response_text)
        
        # Track time to first token (TTFT)
        if not has_first_token:
            has_first_token = True
            time_record['ttft'] = round(time.perf_counter() - start_time, 2)
        
        yield {
            "query": query,
            "result": response_text,
            "retrieval_documents": retrieval_docs,
            "source_documents": source_docs,
        }, history
    
    # Track completion metrics
    time_record['generation_time'] = round(time.perf_counter() - start_time, 2)
    time_record['completion_tokens'] = llm.num_tokens(accumulated_response)
```

#### FAQ Exact Match Optimization

Short-circuit full RAG pipeline for exact FAQ matches:

```python
# Check for exact FAQ matches before expensive generation
for doc in source_documents:
    if (doc.metadata['file_name'].endswith('.faq') and
        normalize_string(doc.metadata['faq_dict']['question']) == normalize_string(query)):
        
        # Return FAQ answer directly without LLM generation
        answer = doc.metadata['faq_dict']['answer']
        async for response, history in self.generate_response(
            query, answer, source_documents, time_record, 'MATCH_FAQ'
        ):
            yield response, history
        return

# Also prioritize high-confidence FAQ matches
high_score_faqs = [
    doc for doc in source_documents 
    if doc.metadata['file_name'].endswith('.faq') and doc.metadata['score'] >= 0.9
]
if high_score_faqs:
    source_documents = high_score_faqs
```

#### Graceful Degradation for Token Limits

Provide informative feedback when context cannot fit:

```python
if len(selected_docs) < len(source_docs):
    if len(selected_docs) == 0:
        # Cannot fit any documents - must fail gracefully
        error_msg = (
            f"Insufficient token budget for documents. "
            f"Available: {available_tokens}, Required minimum: {min_chunk_size}. "
            f"Please increase model token window or reduce output tokens."
        )
        yield create_error_response(error_msg, 'TOKENS_NOT_ENOUGH')
        return
    else:
        # Partial fit - warn user
        warning_msg = (
            f"Some documents were truncated due to token limits. "
            f"Original: {len(source_docs)}, Kept: {len(selected_docs)}. "
            f"Answer quality may be affected."
        )
        # Append warning after response
```

---

## Next Steps

- [Retrieval Evaluation Metrics](./03-retrieval-evaluation.md)
- [Generation Evaluation Metrics](./04-generation-evaluation.md)
- [Implementation Best Practices](./05-implementation-practices.md)
