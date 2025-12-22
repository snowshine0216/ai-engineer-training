# Generation Evaluation Metrics

This document covers metrics for evaluating the generation stage of RAG systems.

## Table of Contents

1. [Generation Result Evaluation](#generation-result-evaluation)
   - [Correctness](#correctness)
   - [Relevance](#relevance)
   - [Logic](#logic)
   - [Style](#style)
2. [Generation Stage Evaluation](#generation-stage-evaluation)
   - [Faithfulness](#faithfulness)
   - [Noise Robustness](#noise-robustness)
   - [Negative Rejection](#negative-rejection)
   - [Information Integration](#information-integration)
   - [Counterfactual Robustness](#counterfactual-robustness)
3. [Evaluation Methods](#evaluation-methods)

---

## Generation Result Evaluation

These metrics assess the overall quality of the generated response.

### Correctness

**Definition**: The factual accuracy of the generated response compared to ground truth.

**Aspects**:
- Factual accuracy of claims
- Numerical precision
- Entity correctness
- Temporal accuracy

**Evaluation Approaches**:
| Approach | Description | Pros/Cons |
|----------|-------------|-----------|
| Exact match | Compare against reference answer | Simple but rigid |
| Semantic similarity | Embedding-based comparison | Handles paraphrasing |
| LLM-as-judge | Use LLM to verify correctness | Flexible but costly |
| Fact verification | Check individual claims | Fine-grained but complex |

**Metrics**:
- Exact Match (EM): Binary correct/incorrect
- Token-level F1: Overlap between predicted and reference tokens
- BERTScore: Semantic similarity using embeddings
- LLM accuracy score: Rating from evaluator LLM (e.g., 1-5 scale)

### Relevance

**Definition**: How well the generated response addresses the user's query.

**Aspects**:
- Query-response alignment
- Completeness of answer
- Focus on query intent
- No off-topic information

**Evaluation Approaches**:
- **Query-grounded evaluation**: Does the response answer what was asked?
- **Intent classification**: Does the response match query intent?
- **Coverage analysis**: Are all aspects of the query addressed?

**Metrics**:
- Answer Relevancy Score (RAGAS): Measures if questions from the answer match the original query
- Semantic similarity: Cosine similarity between query and response embeddings
- LLM relevance rating: Evaluator LLM scoring

### Logic

**Definition**: The coherence, reasoning quality, and structural soundness of the response.

**Aspects**:
- Logical consistency
- Valid reasoning chains
- Proper cause-effect relationships
- No contradictions within response

**Evaluation Approaches**:
- **Structure analysis**: Check for logical flow
- **Contradiction detection**: Identify conflicting statements
- **Reasoning verification**: Validate inference steps

**Metrics**:
- Coherence score: Internal consistency rating
- Entailment verification: Do conclusions follow from premises?
- LLM logic rating: Evaluator assessment of reasoning

### Style

**Definition**: Appropriateness of tone, format, and presentation.

**Aspects**:
- Appropriate tone (formal/informal)
- Format compliance (lists, paragraphs, code blocks)
- Clarity and readability
- Proper grammar and spelling
- Response length appropriateness

**Evaluation Approaches**:
- **Style guidelines check**: Compliance with defined rules
- **Readability metrics**: Flesch-Kincaid, etc.
- **Human evaluation**: Subjective style assessment

### Implementation Practices

> *To be filled with specific implementation guidance*

---

## Generation Stage Evaluation

These metrics specifically evaluate how well the generation stage uses retrieved context.

### Faithfulness

**Definition**: The degree to which the generated response is grounded in and supported by the retrieved context.

**Why It Matters**:
- Prevents hallucination of facts not in context
- Ensures responses are evidence-based
- Critical for trustworthy RAG systems

**Evaluation Approach**:

1. **Claim extraction**: Break response into atomic claims
2. **Evidence matching**: Check if each claim is supported by retrieved context
3. **Score calculation**: Ratio of supported claims to total claims

```
Faithfulness = |Supported Claims| / |Total Claims|
```

**Example**:
- Response: "Paris is the capital of France. It was founded in the 3rd century."
- Retrieved context: "Paris is the capital and largest city of France."
- Claim 1: "Paris is the capital of France" ✓ (supported)
- Claim 2: "It was founded in the 3rd century" ✗ (not in context)
- Faithfulness = 1/2 = 0.5

**Key Considerations**:
- Common-sense claims (e.g., "water is wet") may not need explicit support
- Inference and deduction should be reasonable
- Focus on factual claims, not opinions or framing

### Noise Robustness

**Definition**: The ability of the generation to ignore irrelevant information in retrieved context.

**Why It Matters**:
- Retrieved context often contains some irrelevant chunks
- System should extract signal from noise
- Prevents distraction by off-topic content

**Evaluation Approach**:

1. **Noise injection**: Add irrelevant documents to context
2. **Response comparison**: Compare responses with and without noise
3. **Degradation measurement**: Quantify impact on correctness

**Metrics**:
- Noise-induced error rate: Increase in errors with noisy context
- Noise sensitivity: Change in response quality vs. noise level
- Focus precision: Ratio of response content from relevant vs. irrelevant sources

**Testing Strategy**:
| Noise Level | Description |
|-------------|-------------|
| 0% | Only relevant context |
| 25% | 75% relevant, 25% irrelevant |
| 50% | Equal relevant and irrelevant |
| 75% | 25% relevant, 75% irrelevant |

### Negative Rejection

**Definition**: The ability to appropriately refuse to answer when retrieved context doesn't contain relevant information.

**Why It Matters**:
- Prevents hallucination when knowledge is unavailable
- Builds user trust through honest uncertainty
- Critical for high-stakes applications

**Evaluation Approach**:

1. **No-answer queries**: Use queries where context has no answer
2. **Response analysis**: Check if system refuses vs. fabricates
3. **Refusal quality**: Evaluate how refusal is communicated

**Metrics**:
- Rejection rate on unanswerable queries: Should be high
- False rejection rate: Rejecting answerable queries (should be low)
- Refusal appropriateness: Quality of refusal response

**Expected Behaviors**:
| Context State | Expected Response |
|---------------|-------------------|
| Contains answer | Provide answer with confidence |
| Partially relevant | Answer with caveats |
| Irrelevant | Clearly state inability to answer |
| Contradictory | Acknowledge uncertainty |

### Information Integration

**Definition**: The ability to synthesize information from multiple retrieved chunks into a coherent response.

**Why It Matters**:
- Complex questions require multi-hop reasoning
- Answers may span multiple documents
- Information must be combined without contradiction

**Evaluation Approach**:

1. **Multi-source queries**: Use questions requiring multiple chunks
2. **Integration assessment**: Check if information is properly combined
3. **Attribution tracking**: Verify sources are correctly combined

**Aspects**:
- **Aggregation**: Combining facts from multiple sources
- **Comparison**: Contrasting information across sources
- **Synthesis**: Creating coherent narrative from fragments
- **Inference**: Drawing conclusions from combined information

**Metrics**:
- Multi-source accuracy: Correctness on multi-chunk questions
- Coverage completeness: How much relevant info is integrated
- Integration coherence: Smooth combination of sources

### Counterfactual Robustness

**Definition**: The ability to handle contradictory or conflicting information in retrieved context.

**Why It Matters**:
- Knowledge bases may contain outdated or conflicting information
- System should handle contradictions gracefully
- Important for maintaining accuracy and trust

**Evaluation Approach**:

1. **Contradiction injection**: Add conflicting information to context
2. **Response analysis**: How does system handle conflicts?
3. **Resolution assessment**: Is the conflict acknowledged/resolved?

**Expected Behaviors**:
| Conflict Type | Expected Response |
|---------------|-------------------|
| Temporal (old vs. new) | Prefer recent information, note updates |
| Source authority | Consider source reliability |
| Factual disagreement | Acknowledge uncertainty or cite both |
| Minor discrepancy | Resolve if possible, flag if significant |

**Metrics**:
- Contradiction accuracy: Correct handling of conflicting info
- Conflict acknowledgment rate: Identifying and flagging conflicts
- Resolution appropriateness: Quality of conflict handling

### Implementation Practices

> *To be filled with specific implementation guidance*

---

## Evaluation Methods

### LLM-as-a-Judge

Using large language models to evaluate RAG responses.

**Approach**:
1. Define evaluation criteria (rubric)
2. Provide context, query, and response to evaluator LLM
3. LLM rates/scores based on criteria
4. Aggregate scores across test set

**Advantages**:
- Scalable and automated
- Handles nuanced evaluation
- Can follow complex rubrics

**Limitations**:
- Position bias
- Self-preference bias
- Consistency challenges
- Evaluation cost

### Human Evaluation

**When to Use**:
- Validating automated metrics
- Subjective quality assessment
- High-stakes deployment decisions

**Guidelines**:
- Clear evaluation rubric
- Multiple annotators for reliability
- Inter-annotator agreement measurement

### Automated Metrics Pipeline

**Components**:
1. Test dataset with queries and ground truth
2. Retrieval quality metrics
3. Generation quality metrics
4. Aggregation and reporting

### Popular Frameworks

| Framework | Strengths |
|-----------|-----------|
| RAGAS | Comprehensive RAG metrics |
| TruLens | Feedback functions, evaluation |
| DeepEval | LLM evaluation framework |
| Phoenix | Observability and evaluation |

### Implementation Practices

> *To be filled with specific implementation guidance*

---

## Metric Selection Summary

| Use Case | Key Metrics |
|----------|-------------|
| Factual QA | Correctness, Faithfulness |
| Open-ended generation | Relevance, Logic, Style |
| High-stakes applications | Faithfulness, Negative Rejection |
| Multi-document synthesis | Information Integration |
| Noisy knowledge bases | Noise Robustness, Counterfactual Robustness |

---

## Next Steps

- [Implementation Best Practices](./05-implementation-practices.md)
