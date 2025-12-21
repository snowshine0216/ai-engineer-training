# ImageOCRReader Design Document

## 1. Overview

This document describes the design and implementation of `ImageOCRReader`, a custom LlamaIndex reader that integrates PP-OCR v5 to extract text from images and convert them into `Document` objects for use in RAG (Retrieval-Augmented Generation) pipelines.

## 2. Architecture

### 2.1 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LlamaIndex RAG Pipeline                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────────────┐ │
│  │   Images    │───▶│  ImageOCRReader  │───▶│     Document Objects        │ │
│  │ (PNG/JPG)   │    │  (BaseReader)    │    │  - text: extracted content  │ │
│  └─────────────┘    │                  │    │  - metadata: image info     │ │
│                     │  ┌────────────┐  │    └──────────────┬──────────────┘ │
│                     │  │  PP-OCR v5 │  │                   │                │
│                     │  │  Engine    │  │                   ▼                │
│                     │  └────────────┘  │    ┌─────────────────────────────┐ │
│                     └──────────────────┘    │     VectorStoreIndex        │ │
│                                             │  - Embedding generation     │ │
│                                             │  - Similarity search        │ │
│                                             └──────────────┬──────────────┘ │
│                                                            │                │
│                                                            ▼                │
│                                             ┌─────────────────────────────┐ │
│                                             │       Query Engine          │ │
│                                             │  - Semantic retrieval       │ │
│                                             │  - LLM response generation  │ │
│                                             └─────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                            ImageOCRReader                                   │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Initialization                               │   │
│  │  - lang: OCR language ('ch', 'en', 'fr', etc.)                      │   │
│  │  - use_gpu: Whether to use GPU acceleration                         │   │
│  │  - **kwargs: Additional PaddleOCR parameters                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                           Core Methods                               │   │
│  │                                                                      │   │
│  │  load_data(file: Union[str, List[str]]) -> List[Document]           │   │
│  │    ├── Single file processing                                       │   │
│  │    └── Multiple files processing (batch)                            │   │
│  │                                                                      │   │
│  │  load_data_from_dir(dir_path: str) -> List[Document]  [Optional]    │   │
│  │    └── Directory batch processing                                   │   │
│  │                                                                      │   │
│  │  visualize_ocr(file: str, output_path: str) [Optional]              │   │
│  │    └── Draw bounding boxes on image                                 │   │
│  │                                                                      │   │
│  │  _process_single_image(file_path: str) -> Document                  │   │
│  │    ├── OCR text extraction                                          │   │
│  │    ├── Text concatenation                                           │   │
│  │    └── Metadata generation                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       PP-OCR v5 Integration                          │   │
│  │                                                                      │   │
│  │  PaddleOCR Engine:                                                   │   │
│  │    - Text Detection: Locate text regions in image                  │   │
│  │    - Text Recognition: Extract text from detected regions          │   │
│  │    - Confidence scores: Quality metrics for each detection         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

## 3. Class Design

### 3.1 Class Diagram

```python
class ImageOCRReader(BaseReader):
    """
    Custom LlamaIndex reader using PP-OCR v5 for text extraction from images.
    
    Attributes:
        _ocr: PaddleOCR engine instance
        _lang: OCR language setting
        _use_gpu: GPU acceleration flag
        _extra_params: Additional PaddleOCR configuration
    
    Methods:
        load_data(file) -> List[Document]
        load_data_from_dir(dir_path) -> List[Document]
        visualize_ocr(file, output_path) -> str
        _process_single_image(file_path) -> Document
        _extract_text_from_result(result) -> Tuple[str, float, int]
    """
```

### 3.2 Method Specifications

#### `__init__(self, lang='ch', use_gpu=False, **kwargs)`

**Purpose**: Initialize the ImageOCRReader with PP-OCR engine configuration.

**Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `lang` | str | 'ch' | OCR language ('ch', 'en', 'fr', etc.) |
| `use_gpu` | bool | False | Enable GPU acceleration |
| `**kwargs` | dict | {} | Additional PaddleOCR parameters |

**PaddleOCR Configuration Options**:
- `use_doc_orientation_classify`: Document orientation classification
- `use_doc_unwarping`: Text image unwarping
- `use_textline_orientation`: Text line orientation classification
- `ocr_version`: PP-OCR version selection

#### `load_data(self, file: Union[str, List[str]]) -> List[Document]`

**Purpose**: Extract text from single or multiple images and return Document objects.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `file` | str \| List[str] | Image path or list of image paths |

**Returns**: List[Document] with extracted text and metadata.

**Flow**:

1. Normalize input (single path to list)
2. For each image path:
   a. Validate file existence
   b. Run PP-OCR prediction
   c. Extract text blocks
   d. Calculate confidence scores
   e. Create Document with metadata
3. Return Document list


#### `load_data_from_dir(self, dir_path: str, extensions: List[str] = None) -> List[Document]`

**Purpose**: Batch process all images in a directory.

**Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dir_path` | str | - | Directory path containing images |
| `extensions` | List[str] | ['.png', '.jpg', '.jpeg', '.bmp', '.webp'] | File extensions to process |

**Returns**: List[Document] from all processed images.

#### `visualize_ocr(self, file: str, output_path: str) -> str`

**Purpose**: Generate visualization of OCR detection with bounding boxes.

**Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `file` | str | Input image path |
| `output_path` | str | Output visualization path |

**Returns**: Path to the saved visualization image.

### 3.3 Document Schema

```python
Document(
    text=<concatenated_text>,
    metadata={
        "image_path": str,          # Original image path
        "ocr_model": str,           # "PP-OCRv5"
        "language": str,            # OCR language used
        "num_text_blocks": int,     # Number of detected text blocks
        "avg_confidence": float,    # Average recognition confidence (0-1)
        "file_name": str,           # Image filename
        "file_size": int,           # File size in bytes
        "processing_time": float,   # OCR processing time in seconds
    }
)
```

## 4. Text Concatenation Strategy

### 4.1 Default Strategy: Reading Order

Text blocks are concatenated based on their spatial position:


┌─────────────────────────────────────┐
│ [Block 1] Title Text                │  ← Top-left starts first
│                                     │
│ [Block 2] Subtitle                  │  ← Second line
│                                     │
│ [Block 3] Left column   [Block 4]   │  ← Same row, left-to-right
│ content here            Right col   │
│                                     │
│ [Block 5] Footer text               │  ← Bottom
└─────────────────────────────────────┘

Output: "Title Text\nSubtitle\nLeft column content here\nRight col\nFooter text"


### 4.2 Sorting Algorithm

```python
# Sort by Y coordinate first (top to bottom), then X coordinate (left to right)
def sort_text_blocks(blocks):
    return sorted(blocks, key=lambda b: (b.center_y, b.center_x))
```

### 4.3 Alternative Strategies (Configurable)

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `reading_order` | Top-to-bottom, left-to-right | General documents |
| `confidence` | High confidence first | Quality prioritization |
| `raw` | PP-OCR default order | Preserve original |
| `structured` | Semantic grouping | Complex layouts |

## 5. Error Handling

### 5.1 Error Categories

```python
class OCRError(Exception):
    """Base OCR error"""
    pass

class ImageNotFoundError(OCRError):
    """Image file not found"""
    pass

class ImageFormatError(OCRError):
    """Unsupported image format"""
    pass

class OCRProcessingError(OCRError):
    """OCR engine processing failed"""
    pass
```

### 5.2 Error Handling Flow

```
┌──────────────┐     ┌────────────────┐     ┌──────────────────┐
│ File Input   │────▶│ Validation     │────▶│ Error Response   │
└──────────────┘     │ - File exists? │     │ - Log warning    │
                     │ - Valid format?│     │ - Skip/Continue  │
                     │ - Readable?    │     │ - Empty Document │
                     └────────────────┘     └──────────────────┘
```

## 6. Performance Considerations

### 6.1 Optimization Strategies

1. **Model Caching**: PaddleOCR engine initialized once and reused
2. **Batch Processing**: Process multiple images efficiently
3. **GPU Acceleration**: Optional CUDA support for large workloads
4. **Lazy Loading**: Models loaded on first use

### 6.2 Memory Management

```python
# Recommended batch size based on image resolution
BATCH_SIZES = {
    "low_res": 16,    # < 1 MP
    "medium_res": 8,  # 1-4 MP
    "high_res": 4,    # > 4 MP
}
```

## 7. Optional Features

### 7.1 PDF Support

```python
def load_pdf(self, pdf_path: str) -> List[Document]:
    """
    Process scanned PDF by converting pages to images.
    
    Flow:
    1. Convert PDF pages to images (using pdf2image)
    2. Process each page image with OCR
    3. Add page number to metadata
    4. Return Document list
    """
```

### 7.2 Visualization

```python
def visualize_ocr(self, file: str, output_path: str) -> str:
    """
    Draw detection bounding boxes on image.
    
    Uses OpenCV to:
    1. Load original image
    2. Draw polygon boxes around detected text
    3. Add confidence labels
    4. Save annotated image
    """
```

## 8. Usage Examples

### 8.1 Basic Usage

```python
from ocr_research.image_ocr_reader import ImageOCRReader
from llama_index.core import VectorStoreIndex

# Initialize reader
reader = ImageOCRReader(lang='ch', use_gpu=False)

# Load single image
documents = reader.load_data("path/to/image.png")

# Build index
index = VectorStoreIndex.from_documents(documents)

# Query
query_engine = index.as_query_engine()
response = query_engine.query("What text is in the image?")
```

### 8.2 Batch Processing

```python
# Process multiple images
documents = reader.load_data([
    "image1.png",
    "image2.jpg",
    "image3.jpeg"
])

# Or process directory
documents = reader.load_data_from_dir("./images/")
```

### 8.3 With Visualization

```python
# Generate OCR visualization
reader.visualize_ocr("input.png", "output_with_boxes.png")
```

## 9. Dependencies

```toml
[project.dependencies]
llama-index-core = ">=0.14.10"
paddleocr = ">=3.3.2"
paddlepaddle = ">=3.2.2"  # or paddlepaddle-gpu for GPU support
opencv-python = ">=4.8.0"  # Optional: for visualization
pdf2image = ">=1.16.0"     # Optional: for PDF support
```

## 10. Testing Strategy

### 10.1 Test Categories

| Category | Description | Sample Images |
|----------|-------------|---------------|
| Clear Documents | Scanned documents with clear text | Invoice, contracts |
| Screenshots | UI elements, web pages | Application screenshots |
| Natural Scenes | Street signs, billboards | Photos with text |
| Challenging | Tilted, blurry, artistic fonts | Stress tests |

### 10.2 Metrics

- **Accuracy**: Character/word level recognition accuracy
- **Completeness**: Percentage of text blocks detected
- **Performance**: Processing time per image
- **Confidence**: Average confidence score distribution

## 11. Limitations

1. **Layout Preservation**: Spatial structure (tables, columns) not preserved
2. **Handwriting**: Limited handwriting recognition support
3. **Artistic Fonts**: Decorative fonts may have lower accuracy
4. **Low Resolution**: Images below 300 DPI may have reduced accuracy
5. **Language Mixing**: Single language per reader instance

## 12. Future Improvements

1. **PP-Structure Integration**: Add layout analysis for tables and structured content
2. **Multi-language Support**: Dynamic language detection and switching
3. **Structured Output**: Preserve table and column layouts
4. **Incremental Processing**: Support for streaming large documents
5. **Quality Assessment**: Pre-OCR image quality scoring
