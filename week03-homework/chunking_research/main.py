import sys
from llama_index.core import Settings
from llama_index.readers.file import PDFReader
from pathlib import Path


# add path into sys root path
current_dir = Path(__file__).parent
sys.path.append(str(current_dir))
from core.llm_service import QWLLM, AzureLLM, QWEMBeddingModel, AzureEMBeddingModel
from evaludator import run_comparison_experiments, generate_comparison_table
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
    documents = load_documents()
    config_qw_settings()
    results = run_comparison_experiments(documents)
    table = generate_comparison_table(results)
    print(table)


if __name__ == "__main__":
    main()
