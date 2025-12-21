"""
OCR Research Main Entry Point

This script demonstrates the usage of ImageOCRReader with LlamaIndex
for extracting text from images and building a searchable index.

Usage:
    python -m ocr_research.main
"""

import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def demo_basic_usage():
    """Demonstrate basic ImageOCRReader usage."""
    from ocr_research.image_ocr_reader import ImageOCRReader

    print("=" * 60)
    print("Demo 1: Basic ImageOCRReader Usage")
    print("=" * 60)

    # Initialize reader
    reader = ImageOCRReader(
        lang='ch',
        use_gpu=False,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )

    print("ImageOCRReader initialized successfully!")
    print(f"  - Language: {reader._lang}")
    print(f"  - GPU: {reader._use_gpu}")
    print(f"  - Text concat strategy: {reader._text_concat_strategy}")

    return reader


def demo_single_image(reader, image_path: str):
    """Process a single image and display results."""
    print("\n" + "=" * 60)
    print("Demo 2: Single Image Processing")
    print("=" * 60)

    if not os.path.exists(image_path):
        print(f"Warning: Image not found at {image_path}")
        print("Please provide a valid image path.")
        return None

    print(f"Processing: {image_path}")
    documents = reader.load_data(image_path)

    if documents:
        doc = documents[0]
        print("\n--- Extracted Text ---")
        print(doc.text[:500] if len(doc.text) > 500 else doc.text)
        if len(doc.text) > 500:
            print("... (truncated)")

        print("\n--- Metadata ---")
        for key, value in doc.metadata.items():
            print(f"  {key}: {value}")

    return documents


def demo_directory_processing(reader, dir_path: str):
    """Process all images in a directory."""
    print("\n" + "=" * 60)
    print("Demo 3: Directory Batch Processing")
    print("=" * 60)

    if not os.path.exists(dir_path):
        print(f"Warning: Directory not found at {dir_path}")
        return None

    print(f"Processing directory: {dir_path}")
    documents = reader.load_data_from_dir(dir_path)

    print(f"\nProcessed {len(documents)} images:")
    for i, doc in enumerate(documents, 1):
        print(f"\n  Image {i}: {doc.metadata.get('file_name', 'unknown')}")
        print(f"    - Text blocks: {doc.metadata.get('num_text_blocks', 0)}")
        print(f"    - Avg confidence: {doc.metadata.get('avg_confidence', 0):.4f}")
        print(f"    - Processing time: {doc.metadata.get('processing_time', 0):.3f}s")

    return documents


def demo_with_llamaindex(documents):
    """Build LlamaIndex and perform queries."""
    print("\n" + "=" * 60)
    print("Demo 4: LlamaIndex Integration")
    print("=" * 60)

    if not documents or all(not doc.text.strip() for doc in documents):
        print("No documents with text to index.")
        return

    # Filter out empty documents
    valid_docs = [doc for doc in documents if doc.text.strip()]

    if not valid_docs:
        print("No valid documents to index.")
        return

    print(f"Building index from {len(valid_docs)} documents...")

    try:
        from llama_index.core import Settings, VectorStoreIndex
        from llama_index.llms.openai_like import OpenAILike
        from llama_index.embeddings.dashscope import (
            DashScopeEmbedding,
            DashScopeTextEmbeddingModels
        )

        # Configure LlamaIndex with DashScope models
        api_key = os.getenv("DASHSCOPE_API_KEY")
        if not api_key:
            print("Warning: DASHSCOPE_API_KEY not set. Skipping LlamaIndex demo.")
            return

        Settings.llm = OpenAILike(
            model="qwen-plus",
            api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
            api_key=api_key,
            is_chat_model=True
        )

        Settings.embed_model = DashScopeEmbedding(
            model_name=DashScopeTextEmbeddingModels.TEXT_EMBEDDING_V3,
            embed_batch_size=6,
            embed_input_length=8192
        )

        # Build index
        index = VectorStoreIndex.from_documents(valid_docs)
        query_engine = index.as_query_engine()

        print("Index built successfully!")

        # Example queries
        queries = [
            "图片中提到了什么内容？",
            "What text is visible in the images?",
        ]

        for query in queries:
            print(f"\nQuery: {query}")
            response = query_engine.query(query)
            print(f"Response: {response}")

    except ImportError as e:
        print(f"Import error: {e}")
        print("Please install required packages for LlamaIndex integration.")
    except Exception as e:
        print(f"Error during LlamaIndex demo: {e}")


def demo_visualization(reader, image_path: str, output_path: str):
    """Generate OCR visualization with bounding boxes."""
    print("\n" + "=" * 60)
    print("Demo 5: OCR Visualization")
    print("=" * 60)

    if not os.path.exists(image_path):
        print(f"Warning: Image not found at {image_path}")
        return None

    try:
        result_path = reader.visualize_ocr(image_path, output_path)
        print(f"Visualization saved to: {result_path}")
        return result_path
    except ImportError as e:
        print(f"Visualization requires OpenCV: {e}")
        print("Install with: pip install opencv-python")
        return None
    except Exception as e:
        print(f"Error during visualization: {e}")
        return None


def main():
    """Main entry point for OCR research demo."""
    print("\n" + "=" * 60)
    print("     ImageOCRReader Demo - PP-OCR v5 + LlamaIndex")
    print("=" * 60)

    # Initialize reader
    reader = demo_basic_usage()

    # Define paths (update these to your actual image paths)
    project_root = Path(__file__).parent.parent
    sample_images_dir = project_root / "data" / "images"
    sample_image = sample_images_dir / "line.jpeg"
    output_dir = project_root / "ocr_research" / "output"

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    # Check if sample images exist
    if sample_images_dir.exists():
        # Demo directory processing
        documents = demo_directory_processing(reader, str(sample_images_dir))

        if documents:
            # Demo LlamaIndex integration
            demo_with_llamaindex(documents)
    else:
        print(f"\nNote: Sample images directory not found at {sample_images_dir}")
        print("To run full demo, create this directory with some sample images.")
        print("\nYou can also run the reader manually:")
        print("```python")
        print("from ocr_research.image_ocr_reader import ImageOCRReader")
        print("reader = ImageOCRReader(lang='ch')")
        print("docs = reader.load_data('path/to/your/image.png')")
        print("print(docs[0].text)")
        print("```")

    # Demo single image if available
    if sample_image.exists():
        demo_single_image(reader, str(sample_image))
        demo_visualization(
            reader,
            str(sample_image),
            str(output_dir / "visualization.png")
        )

    print("\n" + "=" * 60)
    print("Demo completed!")
    print("=" * 60)


if __name__ == "__main__":
    main()
