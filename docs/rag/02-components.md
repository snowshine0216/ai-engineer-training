# RAG System Components

This document provides an overview of each component in a production RAG system. The detailed documentation is split into two parts for easier navigation.

## Component Overview

A typical RAG system consists of two main pipelines:

```
┌─────────────────────────────────────────────────────────────────┐
│                     INDEXING PIPELINE                           │
│  Documents → Ingestion → Chunking → Embedding → Vector Store   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                 RETRIEVAL & GENERATION PIPELINE                  │
│  Query → Retrieval → Reranking → Context Formatting → LLM      │
└─────────────────────────────────────────────────────────────────┘
```

## Documentation Structure

### Part A: Indexing Pipeline

📄 **[02a-indexing-pipeline.md](./02a-indexing-pipeline.md)**

Covers how documents are processed and stored:

1. **Data Ingestion and Preprocessing**
   - Multi-format file support (PDF, DOCX, images, audio, etc.)
   - OCR vs. Multimodal LLM approaches
   - Image sanitization and LLM preprocessing
   - PDF processing best practices
   - Error handling and metadata injection

2. **Chunking Strategies**
   - Chunk size selection guidelines
   - Markdown-aware chunking
   - Parent-child hierarchical chunking
   - Semantic chunking
   - Document-specific rules

3. **Embedding Models**
   - Model selection criteria
   - Popular options (OpenAI, Cohere, open-source)

4. **Vector Stores and Indexing**
   - ANN algorithms (HNSW, IVF, LSH)
   - Managed vs. self-hosted options
   - Hybrid search capabilities

---

### Part B: Retrieval and Generation

📄 **[02b-retrieval-generation.md](./02b-retrieval-generation.md)**

Covers how queries are processed to generate responses:

5. **Retrieval Mechanisms**
   - Dense, sparse, and hybrid retrieval
   - Query expansion and decomposition
   - HyDE and multi-query approaches

6. **Reranking**
   - Cross-encoder vs. LLM-based reranking
   - Popular rerankers (Cohere, BGE, ColBERT)
   - Two-stage retrieval benefits

7. **Generation with Context**
   - Context formatting strategies
   - Prompt engineering for RAG
   - Citation integration
   - Response synthesis patterns (Stuff, Map-reduce, Refine, Tree)

---

## Quick Reference

| Component | Key Decision | Common Options |
|-----------|-------------|----------------|
| Document Loader | Format support | Unstructured, LangChain loaders |
| OCR | Speed vs. quality | PaddleOCR, Tesseract, Multimodal LLM |
| Chunking | Size/overlap | 256-1024 tokens, 10-20% overlap |
| Embedding | Dimension/language | OpenAI, BGE, E5 |
| Vector Store | Managed vs. self-hosted | Pinecone, Milvus, Qdrant |
| Retrieval | Dense vs. hybrid | Semantic + BM25 |
| Reranker | Quality vs. cost | Cohere, BGE Reranker |
| Generation | Context strategy | Stuff, Map-reduce |

---

## Next Steps

- [Retrieval Evaluation Metrics](./03-retrieval-evaluation.md)
- [Generation Evaluation Metrics](./04-generation-evaluation.md)
- [Implementation Best Practices](./05-implementation-practices.md)
