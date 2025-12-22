# Retrieval Evaluation Metrics

This document covers metrics for evaluating the retrieval stage of RAG systems.

## Table of Contents

1. [Pure Retrieval Metrics](#pure-retrieval-metrics)
   - [Precision](#precision)
   - [Recall](#recall)
   - [F1 Score](#f1-score)
2. [Ranking Metrics](#ranking-metrics)
   - [Mean Reciprocal Rank (MRR)](#mean-reciprocal-rank-mrr)
   - [Mean Average Precision (MAP)](#mean-average-precision-map)
   - [Normalized Discounted Cumulative Gain (NDCG)](#normalized-discounted-cumulative-gain-ndcg)
3. [Practical Evaluation Strategies](#practical-evaluation-strategies)

---

## Pure Retrieval Metrics

These metrics evaluate retrieval quality with binary relevance judgments (relevant/not relevant).

### Precision

**Definition**: The fraction of retrieved documents that are relevant.

```
Precision = |Relevant ∩ Retrieved| / |Retrieved|
```

**Interpretation**:
- High precision = Few irrelevant results retrieved
- Important when noise in context is costly (e.g., can cause hallucination)

**Example**:
- Query: "What is the capital of France?"
- Retrieved: 5 documents, 3 are relevant
- Precision = 3/5 = 0.6

**Precision@K**:
- Precision calculated for top K retrieved documents
- Common values: P@1, P@3, P@5, P@10

### Recall

**Definition**: The fraction of relevant documents that are retrieved.

```
Recall = |Relevant ∩ Retrieved| / |Relevant|
```

**Interpretation**:
- High recall = Few relevant documents missed
- Important when completeness is critical

**Example**:
- Query: "What is the capital of France?"
- Total relevant documents: 10
- Retrieved relevant: 3
- Recall = 3/10 = 0.3

**Recall@K**:
- Recall calculated for top K retrieved documents
- Measures coverage within a retrieval budget

### F1 Score

**Definition**: Harmonic mean of precision and recall.

```
F1 = 2 × (Precision × Recall) / (Precision + Recall)
```

**Interpretation**:
- Balanced measure when both precision and recall matter
- Range: 0 to 1 (higher is better)

**Example**:
- Precision = 0.6, Recall = 0.3
- F1 = 2 × (0.6 × 0.3) / (0.6 + 0.3) = 0.4

### Implementation Practices

> *To be filled with specific implementation guidance*

---

## Ranking Metrics

These metrics evaluate the quality of document ranking, not just the set of retrieved documents.

### Mean Reciprocal Rank (MRR)

**Definition**: Average of the reciprocal of the rank of the first relevant document across queries.

```
MRR = (1/|Q|) × Σ (1/rank_i)
```

Where rank_i is the rank of the first relevant document for query i.

**Interpretation**:
- Focuses on finding the first relevant result
- Range: 0 to 1 (higher is better)
- Best for single-answer scenarios

**Example**:
| Query | First Relevant at Rank | Reciprocal Rank |
|-------|------------------------|-----------------|
| Q1 | 1 | 1/1 = 1.0 |
| Q2 | 3 | 1/3 = 0.33 |
| Q3 | 2 | 1/2 = 0.5 |

MRR = (1.0 + 0.33 + 0.5) / 3 = 0.61

### Mean Average Precision (MAP)

**Definition**: Mean of Average Precision (AP) across all queries.

**Average Precision (AP)** for a single query:

```
AP = (1/|R|) × Σ (Precision@k × rel(k))
```

Where:
- R = set of relevant documents
- rel(k) = 1 if document at rank k is relevant, 0 otherwise

**Interpretation**:
- Considers the overall ranking quality
- Rewards having relevant documents ranked higher
- Sensitive to the position of all relevant documents

**Example**:
- Relevant documents: {d1, d3, d5}
- Retrieved ranking: [d1, d2, d3, d4, d5]
- Precision@1 = 1/1 = 1.0 (d1 relevant)
- Precision@2 = 1/2 = 0.5 (d2 not relevant)
- Precision@3 = 2/3 = 0.67 (d3 relevant)
- Precision@4 = 2/4 = 0.5 (d4 not relevant)
- Precision@5 = 3/5 = 0.6 (d5 relevant)

AP = (1.0 + 0.67 + 0.6) / 3 = 0.76

### Normalized Discounted Cumulative Gain (NDCG)

**Definition**: Measures ranking quality using graded relevance scores.

**Discounted Cumulative Gain (DCG)**:

```
DCG@K = Σ (2^rel_i - 1) / log2(i + 1)
```

Where rel_i is the relevance score of the document at position i.

**Ideal DCG (IDCG)**: DCG of the ideal ranking (sorted by relevance)

**NDCG**:

```
NDCG@K = DCG@K / IDCG@K
```

**Interpretation**:
- Handles multi-level relevance (e.g., 0, 1, 2, 3)
- Range: 0 to 1 (higher is better)
- Most comprehensive ranking metric

**Example**:
- Relevance scores: [3, 2, 3, 0, 1] (retrieved order)
- Ideal order: [3, 3, 2, 1, 0]

DCG@5 = (2^3-1)/log2(2) + (2^2-1)/log2(3) + (2^3-1)/log2(4) + (2^0-1)/log2(5) + (2^1-1)/log2(6)
      = 7/1 + 3/1.58 + 7/2 + 0/2.32 + 1/2.58
      = 7 + 1.89 + 3.5 + 0 + 0.39 = 12.78

IDCG@5 = 7/1 + 7/1.58 + 3/2 + 1/2.32 + 0/2.58
       = 7 + 4.43 + 1.5 + 0.43 + 0 = 13.36

NDCG@5 = 12.78 / 13.36 = 0.957

### Implementation Practices

> *To be filled with specific implementation guidance*

---

## Practical Evaluation Strategies

### Creating Evaluation Datasets

1. **Manual Annotation**
   - Human experts label query-document relevance
   - Gold standard but expensive and time-consuming

2. **Synthetic Generation**
   - Use LLMs to generate questions from documents
   - Scalable but may not reflect real user queries

3. **Query Log Mining**
   - Extract queries from production logs
   - Real-world distribution but requires existing system

4. **Cross-encoder Labeling**
   - Use powerful models to label relevance
   - Semi-automated approach

### Evaluation Best Practices

| Practice | Description |
|----------|-------------|
| Multiple queries | Evaluate on diverse query set (100+) |
| Query categories | Stratify by query type/complexity |
| Relevance levels | Consider graded relevance when appropriate |
| Edge cases | Include challenging queries |
| A/B testing | Compare configurations in production |

### Tools and Frameworks

- **RAGAS**: RAG Assessment framework
- **BEIR**: Benchmark for Information Retrieval
- **LlamaIndex**: Built-in evaluation modules
- **LangChain**: Evaluation chains
- **Custom scripts**: Domain-specific evaluation

### Implementation Practices

> *To be filled with specific implementation guidance*

---

## Metric Selection Guide

| Scenario | Recommended Metrics |
|----------|---------------------|
| Single answer expected | MRR |
| Multiple relevant docs matter | Recall@K, MAP |
| Ranking quality important | NDCG |
| Noise sensitivity high | Precision@K |
| Balanced evaluation | F1, NDCG |

---

## Next Steps

- [Generation Evaluation Metrics](./04-generation-evaluation.md)
- [Implementation Best Practices](./05-implementation-practices.md)
