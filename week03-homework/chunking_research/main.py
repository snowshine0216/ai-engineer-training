import sys
from llama_index.core import Settings
from llama_index.core import VectorStoreIndex
from llama_index.readers.file import PDFReader
from core.llm_service import QWLLM, AzureLLM, QWEMBeddingModel, AzureEMBeddingModel
from pathlib import Path

# add path into sys root path
current_dir = Path(__file__).parent
sys.path.append(str(current_dir))

# Data directory path
DATA_DIR = current_dir / "data"


def init_settings(llm_model, embed_model):
    Settings.llm = llm_model
    Settings.embed_model = embed_model


def config_qw_settings():
    init_settings(QWLLM, QWEMBeddingModel)


def config_azure_settings():
    init_settings(AzureLLM, AzureEMBeddingModel)


def load_documents():
    """Load all PDF documents from the data directory using PDFReader"""
    pdf_reader = PDFReader()
    documents = []

    # Load all PDF files from data directory
    for pdf_file in DATA_DIR.glob("*.pdf"):
        print(f"Loading: {pdf_file.name}")
        docs = pdf_reader.load_data(file=pdf_file)
        documents.extend(docs)

    print(f"Loaded {len(documents)} documents from {DATA_DIR}")
    return documents


def main():
    # 作业的入口写在这里。你可以就写这个文件，或者扩展多个文件，但是执行入口留在这里。
    # 在根目录可以通过python -m chunking_research.main 运行
    pass


if __name__ == "__main__":
    main()
