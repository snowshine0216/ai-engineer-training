"""
ImageOCRReader - A custom LlamaIndex reader using PP-OCR v5 for text extraction from images.

This module provides a reader that integrates PaddleOCR with LlamaIndex,
allowing images to be converted into Document objects for use in RAG pipelines.
"""


import time
from pathlib import Path
from typing import List, Union, Optional, Tuple, Dict

from llama_index.core.readers.base import BaseReader
from llama_index.core.schema import Document


class ImageOCRReader(BaseReader):
    """
    Custom LlamaIndex reader using PP-OCR v5 for text extraction from images.
    
    This reader extracts text from images using PaddleOCR and returns
    Document objects with extracted text and metadata including confidence scores.
    
    Attributes:
        _ocr: PaddleOCR engine instance
        _lang: OCR language setting
        _use_gpu: GPU acceleration flag
        _extra_params: Additional PaddleOCR configuration
    
    Example:
        >>> reader = ImageOCRReader(lang='ch', use_gpu=False)
        >>> documents = reader.load_data("path/to/image.png")
        >>> print(documents[0].text)
    """

    # Supported image extensions
    SUPPORTED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.bmp', '.webp', '.tiff', '.tif'}

    def __init__(
        self,
        lang: str = 'en',
        use_gpu: bool = False,
        use_doc_orientation_classify: bool = False,
        use_doc_unwarping: bool = False,
        use_textline_orientation: bool = False,
        text_concat_strategy: str = 'reading_order',
        **kwargs
    ):
        """
        Initialize the ImageOCRReader with PP-OCR engine configuration.       
        Args:
            lang: OCR language ('ch' for Chinese, 'en' for English, 'fr' for French, etc.)
            use_gpu: Whether to use GPU acceleration
            use_doc_orientation_classify: Enable document orientation classification
            use_doc_unwarping: Enable text image unwarping/correction
            use_textline_orientation: Enable text line orientation classification
            text_concat_strategy: Text concatenation strategy 
                - 'reading_order': Top-to-bottom, left-to-right
                - 'raw': Preserve PP-OCR default order
                - 'confidence': Order by confidence score (high to low)
            **kwargs: Additional parameters passed to PaddleOCR
        """
        self._lang = lang
        self._use_gpu = use_gpu
        self._text_concat_strategy = text_concat_strategy
        self._extra_params = {
            'use_doc_orientation_classify': use_doc_orientation_classify,
            'use_doc_unwarping': use_doc_unwarping,
            'use_textline_orientation': use_textline_orientation,
            **kwargs
        }
        
        # Lazy initialization of OCR engine
        self._ocr = None
    
    def _get_ocr_engine(self):
        """
        Lazily initialize and return the PaddleOCR engine.
        
        Returns:
            PaddleOCR: Initialized OCR engine
        """
        if self._ocr is None:
            try:
                from paddleocr import PaddleOCR
            except ImportError as e:
                raise ImportError(
                    "PaddleOCR is required for ImageOCRReader. "
                    "Please install it with: pip install paddleocr paddlepaddle"
                ) from e
            
            # Configure device
            device = 'gpu' if self._use_gpu else 'cpu'
            
            self._ocr = PaddleOCR(
                lang=self._lang,
                device=device,
                **self._extra_params
            )
        
        return self._ocr
    
    def load_data(
        self,
        file: Union[str, Path, List[Union[str, Path]]],
        extra_info: Optional[Dict] = None
    ) -> List[Document]:
        """
        Extract text from single or multiple images and return Document objects.
        
        Args:
            file: Image path string, Path object, or list of paths
            extra_info: Optional additional metadata to include in Documents
        
        Returns:
            List[Document]: Documents containing extracted text and metadata
        
        Raises:
            FileNotFoundError: If image file does not exist
            ValueError: If file format is not supported
        
        Example:
            >>> reader = ImageOCRReader(lang='ch')
            >>> docs = reader.load_data("image.png")
            >>> docs = reader.load_data(["img1.png", "img2.jpg"])
        """
        # Normalize input to list
        if isinstance(file, (str, Path)):
            file_list = [file]
        else:
            file_list = file
        
        documents = []
        
        for file_path in file_list:
            file_path = Path(file_path) if isinstance(file_path, str) else file_path
            
            try:
                doc = self._process_single_image(file_path, extra_info)
                documents.append(doc)
            except Exception as e:
                # Log warning but continue processing other files
                print(f"Warning: Failed to process {file_path}: {e}")
                # Create empty document with error metadata
                documents.append(Document(
                    text="",
                    metadata={
                        "image_path": str(file_path),
                        "error": str(e),
                        "ocr_model": "PP-OCRv5",
                        "language": self._lang,
                        "num_text_blocks": 0,
                        "avg_confidence": 0.0,
                    }
                ))
        
        return documents
    
    def _process_single_image(
        self,
        file_path: Path,
        extra_info: Optional[Dict] = None
    ) -> Document:
        """
        Process a single image file and extract text.
        
        Args:
            file_path: Path to the image file
            extra_info: Optional additional metadata
        
        Returns:
            Document: Document with extracted text and metadata
        """
        # Validate file
        if not file_path.exists():
            raise FileNotFoundError(f"Image file not found: {file_path}")
        
        if file_path.suffix.lower() not in self.SUPPORTED_EXTENSIONS:
            raise ValueError(
                f"Unsupported image format: {file_path.suffix}. "
                f"Supported formats: {self.SUPPORTED_EXTENSIONS}"
            )
        
        # Get OCR engine
        ocr = self._get_ocr_engine()
        
        # Run OCR
        start_time = time.time()
        result = ocr.predict(str(file_path))
        processing_time = time.time() - start_time
        
        # Extract text and confidence
        text, avg_confidence, num_blocks = self._extract_text_from_result(result)
        
        # Get file info
        file_size = file_path.stat().st_size
        
        # Build metadata
        metadata = {
            "image_path": str(file_path.absolute()),
            "file_name": file_path.name,
            "file_size": file_size,
            "ocr_model": "PP-OCRv5",
            "language": self._lang,
            "num_text_blocks": num_blocks,
            "avg_confidence": round(avg_confidence, 4),
            "processing_time": round(processing_time, 3),
            "text_concat_strategy": self._text_concat_strategy,
        }
        
        # Add extra info if provided
        if extra_info:
            metadata.update(extra_info)
        
        return Document(text=text, metadata=metadata)
    
    def _extract_text_from_result(
        self,
        result: List
    ) -> Tuple[str, float, int]:
        """
        Extract text from PP-OCR result based on concatenation strategy.
        
        Args:
            result: PP-OCR prediction result
        
        Returns:
            Tuple containing:
            - Concatenated text string
            - Average confidence score
            - Number of text blocks
        """
        if not result:
            return "", 0.0, 0
        
        text_blocks = []
        total_confidence = 0.0
        num_blocks = 0
        
        # Process each result (usually one per image)
        for res in result:
            # OCRResult inherits from dict, so try dict access first, then attribute access
            rec_texts = None
            rec_scores = None
            rec_polys = None

            # Try dict-style access first (PP-OCR v5 uses dict-like OCRResult)
            if isinstance(res, dict):
                rec_texts = res.get('rec_texts', [])
                rec_scores = res.get('rec_scores', [])
                rec_polys = res.get('rec_polys', [])
            # Fallback to attribute access
            elif hasattr(res, 'rec_texts') and hasattr(res, 'rec_scores'):
                rec_texts = res.rec_texts if res.rec_texts else []
                rec_scores = res.rec_scores if res.rec_scores else []
                rec_polys = res.rec_polys if hasattr(res, 'rec_polys') and res.rec_polys is not None else []

            if rec_texts is None or rec_scores is None:
                continue

            for i, (text, score) in enumerate(zip(rec_texts, rec_scores, strict=False)):
                if text and text.strip():  # Skip empty text
                    # Get bounding box center for sorting
                    center_x, center_y = 0, 0
                    if rec_polys and i < len(rec_polys) and rec_polys[i] is not None:
                        poly = rec_polys[i]
                        # Calculate center from polygon points
                        center_x = sum(p[0] for p in poly) / len(poly)
                        center_y = sum(p[1] for p in poly) / len(poly)

                    text_blocks.append({
                        'text': text,
                        'confidence': float(score),
                        'center_x': center_x,
                        'center_y': center_y,
                    })
                    total_confidence += float(score)
                    num_blocks += 1
        
        if num_blocks == 0:
            return "", 0.0, 0
        
        # Sort based on strategy
        if self._text_concat_strategy == 'reading_order':
            # Sort by Y first (top to bottom), then X (left to right)
            # Use a tolerance for Y coordinate to group lines
            y_tolerance = 20  # pixels
            text_blocks.sort(key=lambda b: (int(b['center_y'] / y_tolerance), b['center_x']))
        elif self._text_concat_strategy == 'confidence':
            # Sort by confidence (high to low)
            text_blocks.sort(key=lambda b: b['confidence'], reverse=True)
        # 'raw' strategy keeps original order
        
        # Concatenate text
        concatenated_text = '\n'.join(block['text'] for block in text_blocks)
        avg_confidence = total_confidence / num_blocks
        
        return concatenated_text, avg_confidence, num_blocks
    
    def load_data_from_dir(
        self,
        dir_path: Union[str, Path],
        extensions: Optional[List[str]] = None,
        recursive: bool = False,
        extra_info: Optional[Dict] = None
    ) -> List[Document]:
        """
        Batch process all images in a directory.
        
        Args:
            dir_path: Directory path containing images
            extensions: File extensions to process (default: all supported)
            recursive: Whether to search subdirectories
            extra_info: Optional additional metadata
        
        Returns:
            List[Document]: Documents from all processed images
        
        Example:
            >>> reader = ImageOCRReader(lang='ch')
            >>> docs = reader.load_data_from_dir("./images/")
            >>> docs = reader.load_data_from_dir("./images/", extensions=['.png', '.jpg'])
        """
        dir_path = Path(dir_path) if isinstance(dir_path, str) else dir_path
        
        if not dir_path.exists():
            raise FileNotFoundError(f"Directory not found: {dir_path}")
        
        if not dir_path.is_dir():
            raise ValueError(f"Path is not a directory: {dir_path}")
        
        # Set default extensions
        if extensions is None:
            extensions = list(self.SUPPORTED_EXTENSIONS)
        else:
            extensions = [ext.lower() if ext.startswith('.') else f'.{ext.lower()}' 
                         for ext in extensions]
        
        # Find all matching files
        image_files = []
        if recursive:
            for ext in extensions:
                image_files.extend(dir_path.rglob(f'*{ext}'))
        else:
            for ext in extensions:
                image_files.extend(dir_path.glob(f'*{ext}'))
        
        # Sort for consistent ordering
        image_files = sorted(image_files)
        
        if not image_files:
            print(f"Warning: No images found in {dir_path} with extensions {extensions}")
            return []
        
        print(f"Processing {len(image_files)} images from {dir_path}...")
        
        return self.load_data(image_files, extra_info)
    
    def visualize_ocr(
        self,
        file: Union[str, Path],
        output_path: Union[str, Path]
    ) -> str:
        """
        Generate visualization of OCR detection with bounding boxes.
        
        Args:
            file: Input image path
            output_path: Output path for visualization image
        
        Returns:
            str: Path to the saved visualization image
        
        Raises:
            ImportError: If OpenCV is not installed
        """
        try:
            import cv2
            import numpy as np
        except ImportError as e:
            raise ImportError(
                "OpenCV is required for visualization. "
                "Please install it with: pip install opencv-python"
            ) from e
        
        file_path = Path(file) if isinstance(file, str) else file
        output_path = Path(output_path) if isinstance(output_path, str) else output_path
        
        # Validate file
        if not file_path.exists():
            raise FileNotFoundError(f"Image file not found: {file_path}")
        
        # Get OCR engine and run prediction
        ocr = self._get_ocr_engine()
        result = ocr.predict(str(file_path))
        
        # Load image
        image = cv2.imread(str(file_path))
        if image is None:
            raise ValueError(f"Failed to load image: {file_path}")
        
        # Draw bounding boxes
        for res in result:
            if hasattr(res, 'rec_polys') and res.rec_polys is not None:
                rec_texts = res.rec_texts if res.rec_texts else []
                rec_scores = res.rec_scores if res.rec_scores else []
                
                for i, poly in enumerate(res.rec_polys):
                    if poly is None:
                        continue
                    
                    # Convert to numpy array
                    points = np.array(poly, dtype=np.int32)
                    
                    # Draw polygon
                    cv2.polylines(image, [points], True, (0, 255, 0), 2)
                    
                    # Add label with confidence
                    if i < len(rec_texts) and i < len(rec_scores):
                        label = f"{rec_scores[i]:.2f}"
                        cv2.putText(
                            image,
                            label,
                            (int(points[0][0]), int(points[0][1]) - 5),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.5,
                            (0, 255, 0),
                            1
                        )
        
        # Ensure output directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Save visualization
        cv2.imwrite(str(output_path), image)
        
        return str(output_path)
    
    def load_pdf(
        self,
        pdf_path: Union[str, Path],
        dpi: int = 300,
        extra_info: Optional[Dict] = None
    ) -> List[Document]:
        """
        Process scanned PDF by converting pages to images and running OCR.
        
        Args:
            pdf_path: Path to the PDF file
            dpi: Resolution for converting PDF pages to images
            extra_info: Optional additional metadata
        
        Returns:
            List[Document]: Documents from all PDF pages
        
        Raises:
            ImportError: If pdf2image is not installed
        """
        try:
            from pdf2image import convert_from_path
        except ImportError as e:
            raise ImportError(
                "pdf2image is required for PDF processing. "
                "Please install it with: pip install pdf2image"
            ) from e
        
        pdf_path = Path(pdf_path) if isinstance(pdf_path, str) else pdf_path
        
        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")
        
        # Convert PDF pages to images
        print(f"Converting PDF to images (DPI={dpi})...")
        images = convert_from_path(str(pdf_path), dpi=dpi)
        
        documents = []
        ocr = self._get_ocr_engine()
        
        for page_num, image in enumerate(images, 1):
            print(f"Processing page {page_num}/{len(images)}...")
            
            # Convert PIL image to numpy array
            import numpy as np
            image_array = np.array(image)
            
            # Run OCR
            start_time = time.time()
            result = ocr.predict(image_array)
            processing_time = time.time() - start_time
            
            # Extract text
            text, avg_confidence, num_blocks = self._extract_text_from_result(result)
            
            # Build metadata
            metadata = {
                "source_file": str(pdf_path.absolute()),
                "file_name": pdf_path.name,
                "page_number": page_num,
                "total_pages": len(images),
                "ocr_model": "PP-OCRv5",
                "language": self._lang,
                "num_text_blocks": num_blocks,
                "avg_confidence": round(avg_confidence, 4),
                "processing_time": round(processing_time, 3),
                "dpi": dpi,
            }
            
            if extra_info:
                metadata.update(extra_info)
            
            documents.append(Document(text=text, metadata=metadata))
        
        return documents
