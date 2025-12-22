# RAG System Components: Indexing Pipeline

This document covers the indexing pipeline components of a production RAG system, including data ingestion, chunking, embeddings, and vector storage.

## Table of Contents

1. [Data Ingestion and Preprocessing](#data-ingestion-and-preprocessing)
2. [Chunking Strategies](#chunking-strategies)
3. [Embedding Models](#embedding-models)
4. [Vector Stores and Indexing](#vector-stores-and-indexing)

---

## Data Ingestion and Preprocessing

### Overview

Data ingestion is the first step in building a RAG system. The quality and preparation of source data directly impacts retrieval effectiveness.

### Key Considerations

- **Document Loaders**: Support for various file formats (PDF, DOCX, HTML, Markdown, etc.)
- **Text Extraction**: Handling complex layouts, tables, and images
- **Metadata Extraction**: Capturing document properties for filtering and hybrid search
- **Data Cleaning**: Removing noise, fixing encoding issues, normalizing text
- **Deduplication**: Identifying and handling duplicate content

### Implementation Practices

#### Multi-Format File Support

Based on production implementations (e.g., QAnything), support the following file formats with specialized loaders:

| Format | Loader Strategy | Key Considerations |
|--------|-----------------|-------------------|
| `.pdf` | PDF Parser → Markdown with layout detection | Use `PyMuPDF (fitz)` for rendering, OCR for scanned pages |
| `.docx` | UnstructuredWordDocumentLoader / `docx2txt` | Fallback parser for complex documents |
| `.xlsx` | Excel → HTML → Markdown conversion | Handle multi-sheet workbooks, drop empty rows/columns |
| `.pptx` | UnstructuredPowerPointLoader | Extract slide text and notes |
| `.md` | Hierarchical Markdown parser (`mistune`) | Parse to JSON tree, preserve heading levels, detect tables |
| `.txt` | TextLoader with encoding detection | Auto-detect encoding (UTF-8, GBK, etc.) |
| `.jpg/.png/.jpeg` | OCR Engine | Use text detection + recognition pipeline |
| `.html` | markdownify conversion | Convert to clean Markdown |
| `.eml` | UnstructuredEmailLoader | Parse email headers + body |
| `.csv` | CSVLoader with auto-encoding | Sparse column filling, key-value formatting |
| `.json` | JSONLoader with recursive flattening | Handle nested structures, auto-detect encoding |
| `.mp3/.wav/.mp4` | faster-whisper with VAD | Enable Voice Activity Detection, output with timestamps |
| `URL/Web` | RecursiveUrlLoader | Depth-controlled crawling, URL defragmentation |

#### Audio Processing with Voice Activity Detection

For audio files, use `faster-whisper` with VAD filtering for cleaner transcription:

```python
from faster_whisper import WhisperModel

# Initialize with GPU if available, fallback to CPU
if torch.cuda.is_available():
    whisper_model = WhisperModel("large-v3", device="cuda", compute_type="float16")
else:
    whisper_model = WhisperModel("large-v3", device="cpu", compute_type="int8")

# Transcribe with VAD filtering to skip silence
segments, info = whisper_model.transcribe(filepath, vad_filter=True)

# Output with timestamps for precise citation
for segment in segments:
    result.append(f"[{segment.start:.2f}s -> {segment.end:.2f}s] {segment.text}")
```

**Key Benefits of VAD:**
- Filters out silence and background noise automatically
- Produces cleaner transcription segments
- Preserves timestamps for citation references

#### OCR vs. Multimodal LLM for Text Extraction

**When to Use Traditional OCR:**
- High-volume batch processing (cost-effective)
- Simple document layouts (invoices, forms)
- Well-scanned documents with clear text
- Latency-sensitive applications

**When to Use Multimodal LLM (e.g., GPT-4o, Gemini, Qwen-VL):**
- Complex layouts with tables, charts, and mixed content
- Handwritten documents or low-quality scans
- Documents requiring semantic understanding for extraction
- When you need structured output (JSON, Markdown with proper hierarchy)

**Recommended Hybrid Approach:**
1. Use traditional OCR for initial text detection and recognition
2. Apply multimodal LLM for complex elements (tables, diagrams, charts)
3. Use layout detection models to identify document structure

**QAnything OCR Pipeline Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│                    OCR Processing Flow                       │
├─────────────────────────────────────────────────────────────┤
│  Image Input                                                 │
│       ↓                                                      │
│  [Text Detector]  → ONNX model (DB algorithm)               │
│       ↓           → Detect text regions (bounding boxes)     │
│  [Box Sorting]    → Sort boxes top-to-bottom, left-to-right │
│       ↓                                                      │
│  [Image Cropping] → Perspective transform for each region   │
│       ↓                                                      │
│  [Text Recognizer]→ ONNX model (CTC decoder)                │
│       ↓           → Character recognition with confidence   │
│  [Score Filter]   → Drop low-confidence results (< 0.5)     │
│       ↓                                                      │
│  Text Output                                                 │
└─────────────────────────────────────────────────────────────┘
```

#### Image Sanitization and Preprocessing

For image-based documents (PNG, JPEG), apply preprocessing before OCR:

**Technical Preprocessing:**
1. **Deskewing**: Correct image rotation/tilt
2. **Noise Reduction**: Remove artifacts, improve contrast
3. **Binarization**: Convert to binary for OCR if needed
4. **Resolution Normalization**: Scale to optimal OCR resolution (typically 300 DPI)

**Content Sanitization with LLM Preprocessing Prompts:**

Use an LLM-based document preprocessing expert to clean and restructure extracted content:

```python
DOCUMENT_PREPROCESSING_PROMPT = """
You are a document preprocessing expert. Your task is to act as an 
expert in text cleaning and annotation, helping prepare documents for 
a RAG knowledge base.

For the given document content, perform the following:

1. **Text Cleaning**:
   - Remove redundant whitespace, empty lines, and formatting noise
   - Fix OCR errors and encoding issues when obvious
   - Normalize punctuation and special characters

2. **Structure Enhancement**:
   - Identify and mark section headings
   - Preserve table structures in Markdown format
   - Convert lists to proper Markdown syntax

3. **Metadata Annotation**:
   - Identify document type (report, email, form, etc.)
   - Extract key entities (dates, names, organizations)
   - Note document language

4. **Quality Assessment**:
   - Flag ambiguous or unclear sections
   - Mark sections that may need human review

Output the cleaned document in Markdown format with annotations.
"""
```

**When to Apply LLM Preprocessing:**
- After initial OCR extraction for scanned documents
- For complex multi-column layouts
- Documents with mixed languages (especially CJK + Latin)
- Legal/medical documents requiring accurate formatting

#### PDF Processing Best Practices

**Two-Tier PDF Strategy (from QAnything):**

1. **Primary Parser (Powerful Mode)**:
   - Render PDF pages as images using `fitz` with zoom factor (3x recommended)
   - Apply layout detection to identify text, tables, figures
   - Use OCR for text recognition
   - Extract tables with specialized table recognition
   - Convert to structured JSON, then to Markdown
   - Preserve page/position metadata for citations

2. **Fallback Parser (Fast Mode)**:
   - Direct text extraction using `page.get_text()`
   - Use when primary parser fails or times out
   - Suitable for digital-native PDFs with embedded text

```python
# QAnything PDF Processing Flow
def process_pdf(file_path):
    try:
        # Powerful mode with layout detection
        markdown_file = pdf_to_markdown_with_layout(file_path)
        docs = parse_markdown_to_documents(markdown_file)
    except Exception:
        # Fallback to fast extraction
        docs = extract_text_fast(file_path)
    return docs
```

**Layout Detection Categories:**
- `text`: Regular paragraph text
- `title`: Section/chapter headings  
- `table`: Tabular data
- `figure`: Images/charts
- `author`: Author information
- `reference`: Bibliography entries

#### CSV/JSON Preprocessing Techniques

**CSV Loading with Sparse Column Handling:**
```python
# Track last non-empty values for sparse columns
last_non_empty_values = {}
for k, v in row.items():
    # Use last known value if current cell is empty
    value = v.strip() if v else last_non_empty_values.get(k, v)
    line_contents.append(f"{k.strip()}: {value}")
    if v:
        last_non_empty_values[k] = v

# Format as structured key-value with separators
content = '------------------------\n'
content += ' & '.join(line_contents)
content += '\n------------------------'
```

**JSON Loading with Recursive Flattening:**
```python
def flatten_json(item: dict, parent_key: str = '') -> List[str]:
    """Flatten nested JSON into dot-notation key-value pairs."""
    items = []
    for k, v in item.items():
        new_key = f"{parent_key}.{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_json(v, new_key))
        elif isinstance(v, list):
            for i, sub_item in enumerate(v):
                items.extend(flatten_json({f"{i}": sub_item}, new_key))
        else:
            items.append(f"{new_key}: {v}")
    return items
```

#### Error Handling and Robustness

Implement comprehensive error handling as demonstrated in QAnything:

```python
# Timeout handling for long documents
async def process_file_with_timeout(file_info):
    parse_timeout = 300   # 5 minutes for parsing
    insert_timeout = 300  # 5 minutes for insertion
    
    try:
        await asyncio.wait_for(
            split_file_to_docs(),
            timeout=parse_timeout
        )
    except asyncio.TimeoutError:
        log_error("Parse timeout")
        return status='red', msg=f"Timeout: {parse_timeout}s"
    
    # Validate content
    content_length = sum(len(doc.page_content) for doc in docs)
    if content_length > MAX_CHARS:
        return status='red', msg="Content too large"
    if content_length == 0:
        return status='red', msg="Empty content"
```

**Status Tracking:**
- `gray`: Pending processing
- `yellow`: Currently processing
- `green`: Successfully processed
- `red`: Processing failed

#### Metadata Injection

Always inject source metadata for traceability:

```python
def inject_metadata(docs):
    for doc in docs:
        doc.metadata.update({
            "file_id": self.file_id,
            "file_name": self.file_name,
            "user_id": self.user_id,
            "kb_id": self.kb_id,
            "timestamp": datetime.now().isoformat()
        })
```

---

## Chunking Strategies

### Overview

Chunking divides documents into smaller, retrievable units. The chunking strategy significantly impacts retrieval quality.

### Key Approaches

| Strategy | Description | Best For |
|----------|-------------|----------|
| Fixed-size | Split by character/token count | Simple documents |
| Sentence-based | Split at sentence boundaries | General text |
| Paragraph-based | Split at paragraph boundaries | Well-structured text |
| Semantic | Split based on topic/meaning changes | Mixed content |
| Hierarchical | Multi-level chunking | Complex documents |
| Document-specific | Custom rules per document type | Structured formats |

### Key Parameters

- **Chunk Size**: Typical range 256-1024 tokens
- **Chunk Overlap**: Typical range 10-20% of chunk size
- **Separator Hierarchy**: Prioritize natural boundaries

### Implementation Practices

#### Chunk Size Selection Guidelines

| Content Type | Recommended Size | Overlap | Rationale |
|--------------|-----------------|---------|-----------|
| Technical docs | 512-768 tokens | 15-20% | Balance detail with context |
| Legal/contracts | 256-512 tokens | 20-25% | Preserve clause boundaries |
| Conversational | 128-256 tokens | 10-15% | Short, focused responses |
| Academic papers | 512-1024 tokens | 15% | Maintain argument flow |
| Code documentation | 256-512 tokens | 10% | Function-level granularity |

#### Markdown-Aware Chunking

For structured documents, respect Markdown hierarchy:

```python
# Separator hierarchy for Markdown documents
separators = [
    "\n## ",      # H2 headings (major sections)
    "\n### ",     # H3 headings (subsections)
    "\n#### ",    # H4 headings (sub-subsections)
    "\n\n",       # Paragraph boundaries
    "\n",         # Line breaks
    ". ",         # Sentence boundaries
    " ",          # Word boundaries (last resort)
]

# RecursiveCharacterTextSplitter with Markdown awareness
from langchain.text_splitter import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,
    chunk_overlap=100,
    separators=separators,
    length_function=len,
    is_separator_regex=False
)
```

#### Parent-Child (Hierarchical) Chunking

Implement two-level chunking for better context preservation:

```python
# Parent chunks: larger context for understanding
# Child chunks: smaller, precise for retrieval

parent_splitter = RecursiveCharacterTextSplitter(
    chunk_size=2000,
    chunk_overlap=200
)

child_splitter = RecursiveCharacterTextSplitter(
    chunk_size=400,
    chunk_overlap=50
)

# Store child chunks in vector store
# Keep parent mapping for context expansion during retrieval
```

**Benefits of Parent-Child Approach:**
- Retrieve precise child chunks matching the query
- Expand to parent context before sending to LLM
- Better semantic coverage without bloating retrievals

#### Semantic Chunking (Advanced)

Use embedding similarity to identify natural breakpoints:

```python
from langchain_experimental.text_splitter import SemanticChunker
from langchain_openai import OpenAIEmbeddings

# Chunk based on semantic similarity between sentences
semantic_chunker = SemanticChunker(
    embeddings=OpenAIEmbeddings(),
    breakpoint_threshold_type="percentile",  # or "standard_deviation"
    breakpoint_threshold_amount=95  # Split at 95th percentile difference
)
```

#### Document-Specific Chunking Rules

| Document Type | Chunking Rule | Implementation |
|--------------|---------------|----------------|
| Tables | Keep rows together | Extract as Markdown tables, chunk by row groups |
| Code | Respect function/class boundaries | Use AST parsing for intelligent splits |
| Q&A / FAQ | One QA pair per chunk | Parse structure, never split mid-answer |
| Emails | Header + body as unit | Include metadata (from, to, subject) with content |
| Slide decks | One slide per chunk | Include slide number in metadata |

#### Overlap Strategies

**Static Overlap:** Fixed percentage (simpler, consistent)
```python
chunk_overlap = int(chunk_size * 0.15)  # 15% overlap
```

**Semantic Overlap:** Include complete sentences at boundaries
```python
def ensure_sentence_boundary(text, max_chars):
    """Extend to complete sentence at boundary."""
    if len(text) <= max_chars:
        return text
    # Find last sentence boundary
    last_period = text[:max_chars].rfind('. ')
    if last_period > max_chars * 0.7:  # Keep if reasonably close
        return text[:last_period + 1]
    return text[:max_chars]
```

#### Chinese/CJK Text Splitting

For Chinese and other CJK languages, use multi-level regex cascading:

```python
class ChineseTextSplitter(CharacterTextSplitter):
    def split_text(self, text: str) -> List[str]:
        # Normalize PDF artifacts
        if self.pdf:
            text = re.sub(r"\n{3,}", r"\n", text)
            text = re.sub('\s', " ", text)
        
        # Level 1: Split on sentence-ending punctuation
        text = re.sub(r'([;；.!?。！？\?])([^"\'])', r"\1\n\2", text)
        text = re.sub(r'(\.{6})([^"\'])', r"\1\n\2", text)  # Ellipsis
        text = re.sub(r'(\…{2})([^"\'])', r"\1\n\2", text)  # Chinese ellipsis
        
        ls = [i for i in text.split("\n") if i]
        
        # Level 2: Split on comma if still too long
        for ele in ls:
            if len(ele) > self.sentence_size:
                ele1 = re.sub(r'([,，.])([^,，.])', r'\1\n\2', ele)
                # Continue splitting...
        
        return ls
```

**Key Features:**
- Handles both Chinese (`。！？，`) and English (`., !?`) punctuation
- Progressive splitting cascade (sentence → comma → space)
- PDF-specific whitespace normalization

#### Chinese Title Enhancement

Detect and use titles to enhance chunk context (unique QAnything pattern):

```python
def is_possible_title(text: str, max_length: int = 20) -> bool:
    """Detect if text is likely a title based on heuristics."""
    if len(text) == 0 or len(text) > max_length:
        return False
    # No ending punctuation
    if text.endswith((",", ".", "，", "。")):
        return False
    # Must have numbers in first 5 chars (common in Chinese docs)
    if not any(c.isnumeric() for c in text[:5]):
        return False
    # Alpha ratio must exceed threshold
    alpha_count = sum(1 for c in text if c.isalpha())
    total_count = sum(1 for c in text if not c.isspace())
    return (alpha_count / total_count) >= 0.5 if total_count > 0 else False

def zh_title_enhance(docs: List[Document]) -> List[Document]:
    """Prepend detected title context to subsequent chunks."""
    title = None
    for doc in docs:
        if is_possible_title(doc.page_content):
            doc.metadata['category'] = 'cn_Title'
            title = doc.page_content
        elif title:
            # Prepend title context to chunk
            doc.page_content = f"下文与({title})有关。{doc.page_content}"
    return docs
```

**Benefits:**
- Provides hierarchical context without complex tree structures
- Improves retrieval relevance for section-specific queries
- Lightweight alternative to parent-child chunking

#### Cancellable Long-Running Operations

For large documents, implement cancellation support:

```python
class ChineseTextSplitter:
    def __init__(self, event: threading.Event = None, **kwargs):
        self.event = event  # External cancellation signal
    
    def create_documents(self, texts: List[str], ...) -> List[Document]:
        for i, text in enumerate(texts):
            if self.event and self.event.is_set():
                logger.warning('Operation cancelled!')
                break
            # Continue processing...
```

#### Production Recommendations

1. **Start Conservative**: Begin with larger chunks (800-1000 tokens), then tune down based on retrieval metrics

2. **Measure Retrieval Quality**: Track:
   - Context relevance score
   - Answer completeness
   - Context redundancy (1-5 scale)

3. **A/B Test Parameters**: Compare different configurations on same query set:
   ```python
   configs = [
       {"chunk_size": 512, "overlap": 50},
       {"chunk_size": 512, "overlap": 100},
       {"chunk_size": 256, "overlap": 50},
       {"chunk_size": 1024, "overlap": 150},
   ]
   ```

4. **Balance Trade-offs**:
   - Smaller chunks → More precise retrieval, risk of missing context
   - Larger chunks → Better context, risk of noise and irrelevant content
   - More overlap → Better continuity, more storage required

---

## Embedding Models

### Overview

Embedding models convert text into dense vector representations that capture semantic meaning.

### Model Selection Criteria

| Factor | Considerations |
|--------|----------------|
| Domain | General vs. domain-specific (legal, medical, code) |
| Language | Monolingual vs. multilingual support |
| Dimensionality | 256 to 4096 dimensions trade-offs |
| Performance | Speed vs. quality balance |
| Cost | Open-source vs. commercial APIs |

### Popular Options

- **OpenAI Embeddings**: text-embedding-3-small, text-embedding-3-large
- **Cohere Embeddings**: embed-english-v3.0, embed-multilingual-v3.0
- **Open-source**: BGE, E5, BAAI, GTE models
- **Domain-specific**: Legal-BERT, BioBERT, CodeBERT

### Implementation Practices

> *To be filled with specific implementation guidance*

---

## Vector Stores and Indexing

### Overview

Vector stores provide efficient storage and similarity search for embeddings.

### Key Features

- **Approximate Nearest Neighbor (ANN)**: HNSW, IVF, LSH algorithms
- **Filtering**: Metadata-based pre/post filtering
- **Hybrid Search**: Combining vector and keyword search
- **Scalability**: Horizontal scaling and sharding

### Popular Options

| Category | Examples |
|----------|----------|
| Managed | Pinecone, Weaviate Cloud, Qdrant Cloud |
| Self-hosted | Milvus, Qdrant, Chroma, Weaviate |
| Database extensions | pgvector, Elasticsearch, MongoDB Atlas |
| Embedded | FAISS, Annoy, ScaNN |

### Implementation Practices

> *To be filled with specific implementation guidance*

---

## Next Steps

- [Retrieval and Generation](./02b-retrieval-generation.md)
- [Retrieval Evaluation Metrics](./03-retrieval-evaluation.md)
- [Generation Evaluation Metrics](./04-generation-evaluation.md)
