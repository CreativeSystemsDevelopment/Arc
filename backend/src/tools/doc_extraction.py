"""
Document extraction tools for PDF processing, OCR, and diagram extraction.

Provides capabilities for:
- PDF text extraction (pdfplumber, pymupdf)
- OCR for scanned documents (easyocr)
- Image/diagram isolation from PDFs
- Technical metadata extraction (BOMs, title blocks, revisions)
"""

from __future__ import annotations

import io
import json
import os
import re
import tempfile
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from langchain.tools import tool
from PIL import Image

# Optional dependencies - may not be installed
PDFPLUMBER_AVAILABLE = False
PYMUPDF_AVAILABLE = False
EASYOCR_AVAILABLE = False

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    pass

try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    pass

try:
    import easyocr
    EASYOCR_AVAILABLE = True
except ImportError:
    pass


def _check_pdf_tool() -> str:
    """Check which PDF tool is available."""
    if PDFPLUMBER_AVAILABLE:
        return "pdfplumber"
    if PYMUPDF_AVAILABLE:
        return "pymupdf"
    raise RuntimeError(
        "No PDF extraction library available. Install with: pip install pdfplumber pymupdf"
    )


def _check_ocr_tool() -> str:
    """Check if OCR is available."""
    if EASYOCR_AVAILABLE:
        return "easyocr"
    raise RuntimeError(
        "No OCR library available. Install with: pip install easyocr"
    )


@dataclass
class ExtractedPage:
    """Represents a single extracted page."""
    page_number: int
    text: str | None = None
    word_count: int = 0
    has_text: bool = False
    image_count: int = 0
    tables: list[dict] = field(default_factory=list)
    ocr_results: list[dict] = field(default_factory=list)
    needs_ocr: bool = False


@dataclass
class ExtractedImage:
    """Represents an extracted image from PDF."""
    page_number: int
    image_index: int
    extension: str
    width: int
    height: int
    size_bytes: int
    image_path: str | None = None
    classification: str | None = None


@dataclass
class ExtractionResult:
    """Complete document extraction result."""
    source_path: str
    document_id: str = field(default_factory=lambda: str(uuid4())[:8])
    classification: dict = field(default_factory=dict)
    pages: list[ExtractedPage] = field(default_factory=list)
    images: list[ExtractedImage] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    total_pages: int = 0
    total_words: int = 0
    output_dir: str | None = None


@tool
def extract_pdf_text(
    pdf_path: str,
    page_numbers: list[int] | None = None,
    extract_tables: bool = True,
    output_dir: str | None = None,
) -> str:
    """
    Extract text from PDF using best available library (pdfplumber preferred).
    
    Args:
        pdf_path: Path to PDF file
        page_numbers: Specific pages to extract (None = all)
        extract_tables: Whether to extract tables
        output_dir: Where to save extraction results
        
    Returns:
        JSON string with extracted text content
    """
    tool = _check_pdf_tool()
    pdf_path = Path(pdf_path).resolve()
    
    if not pdf_path.exists():
        return json.dumps({"error": f"PDF not found: {pdf_path}"})
    
    result = ExtractionResult(source_path=str(pdf_path))
    
    if output_dir:
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        result.output_dir = output_dir
    
    try:
        if tool == "pdfplumber" and PDFPLUMBER_AVAILABLE:
            result = _extract_with_pdfplumber(result, pdf_path, page_numbers, extract_tables)
        elif tool == "pymupdf" and PYMUPDF_AVAILABLE:
            result = _extract_with_pymupdf(result, pdf_path, page_numbers, extract_tables)
        else:
            return json.dumps({"error": "No PDF extraction library available"})
        
        # Save to file if output_dir specified
        if output_dir:
            output_file = Path(output_dir) / f"{pdf_path.stem}_text.json"
            with open(output_file, "w") as f:
                json.dump(_result_to_dict(result), f, indent=2, default=str)
        
        return json.dumps(_result_to_dict(result), indent=2, default=str)
        
    except Exception as e:
        return json.dumps({
            "error": str(e),
            "pdf_path": str(pdf_path),
            "tool_used": tool,
        })


def _extract_with_pdfplumber(
    result: ExtractionResult,
    pdf_path: Path,
    page_numbers: list[int] | None,
    extract_tables: bool,
) -> ExtractionResult:
    """Extract text using pdfplumber."""
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        pages_to_process = page_numbers or range(1, total_pages + 1)
        
        for page_num in pages_to_process:
            if page_num > total_pages or page_num < 1:
                continue
                
            page = pdf.pages[page_num - 1]
            text = page.extract_text(layout=True) or ""
            tables = []
            
            if extract_tables:
                try:
                    page_tables = page.extract_tables()
                    tables = [{"table_index": i, "data": table} 
                             for i, table in enumerate(page_tables)]
                except Exception:
                    pass
            
            page_result = ExtractedPage(
                page_number=page_num,
                text=text,
                word_count=len(text.split()) if text else 0,
                has_text=bool(text and len(text.strip()) > 10),
                tables=tables,
            )
            result.pages.append(page_result)
    
    result.total_pages = len(result.pages)
    result.total_words = sum(p.word_count for p in result.pages)
    result.classification = {
        "has_text_layer": any(p.has_text for p in result.pages),
        "pages_with_text": sum(1 for p in result.pages if p.has_text),
    }
    
    return result


def _extract_with_pymupdf(
    result: ExtractionResult,
    pdf_path: Path,
    page_numbers: list[int] | None,
    extract_tables: bool,
) -> ExtractionResult:
    """Extract text using PyMuPDF."""
    with fitz.open(pdf_path) as doc:
        total_pages = len(doc)
        pages_to_process = page_numbers or range(1, total_pages + 1)
        
        for page_num in pages_to_process:
            if page_num > total_pages or page_num < 1:
                continue
                
            page = doc[page_num - 1]
            text = page.get_text()
            
            # Check for images
            image_list = page.get_images(full=True)
            
            page_result = ExtractedPage(
                page_number=page_num,
                text=text,
                word_count=len(text.split()) if text else 0,
                has_text=bool(text and len(text.strip()) > 10),
                image_count=len(image_list),
            )
            result.pages.append(page_result)
    
    result.total_pages = len(result.pages)
    result.total_words = sum(p.word_count for p in result.pages)
    result.classification = {
        "has_text_layer": any(p.has_text for p in result.pages),
        "pages_with_text": sum(1 for p in result.pages if p.has_text),
    }
    
    return result


@tool
def extract_pdf_images(
    pdf_path: str,
    output_dir: str,
    min_width: int = 100,
    min_height: int = 100,
    page_numbers: list[int] | None = None,
    classify: bool = False,
) -> str:
    """
    Extract images from PDF and save to directory.
    
    Args:
        pdf_path: Path to PDF file
        output_dir: Directory to save extracted images
        min_width: Minimum image width to extract (filters icons)
        min_height: Minimum image height to extract
        page_numbers: Specific pages to process (None = all)
        classify: Whether to classify diagram types
        
    Returns:
        JSON string with extracted image metadata
    """
    if not PYMUPDF_AVAILABLE:
        return json.dumps({
            "error": "PyMuPDF not installed. Run: pip install pymupdf"
        })
    
    pdf_path = Path(pdf_path).resolve()
    output_path = Path(output_dir).resolve()
    output_path.mkdir(parents=True, exist_ok=True)
    
    if not pdf_path.exists():
        return json.dumps({"error": f"PDF not found: {pdf_path}"})
    
    extracted_images: list[dict] = []
    
    try:
        with fitz.open(pdf_path) as doc:
            total_pages = len(doc)
            pages_to_process = page_numbers or range(total_pages)
            
            for page_idx in pages_to_process:
                if page_idx >= total_pages:
                    continue
                    
                page = doc[page_idx]
                page_num = page_idx + 1
                image_list = page.get_images(full=True)
                
                for img_idx, img in enumerate(image_list, 1):
                    xref = img[0]
                    base_image = doc.extract_image(xref)
                    
                    if not base_image:
                        continue
                    
                    image_bytes = base_image["image"]
                    ext = base_image["ext"]
                    width = base_image.get("width", 0)
                    height = base_image.get("height", 0)
                    
                    # Filter by size
                    if width < min_width or height < min_height:
                        continue
                    
                    # Save image
                    filename = f"page-{page_num:03d}_img-{img_idx:03d}.{ext}"
                    filepath = output_path / filename
                    
                    with open(filepath, "wb") as f:
                        f.write(image_bytes)
                    
                    image_info = {
                        "page_number": page_num,
                        "image_index": img_idx,
                        "filename": filename,
                        "filepath": str(filepath),
                        "extension": ext,
                        "width": width,
                        "height": height,
                        "size_bytes": len(image_bytes),
                    }
                    
                    # Simple classification based on aspect ratio
                    if classify:
                        aspect = width / height if height > 0 else 0
                        if aspect > 2.5:
                            image_info["classification"] = "wide_diagram"
                        elif aspect < 0.4:
                            image_info["classification"] = "tall_diagram"
                        elif aspect > 0.9 and aspect < 1.1:
                            image_info["classification"] = "square_image"
                        else:
                            image_info["classification"] = "diagram"
                    
                    extracted_images.append(image_info)
        
        return json.dumps({
            "success": True,
            "pdf_path": str(pdf_path),
            "output_dir": str(output_path),
            "images_extracted": len(extracted_images),
            "images": extracted_images,
        }, indent=2, default=str)
        
    except Exception as e:
        return json.dumps({
            "error": str(e),
            "pdf_path": str(pdf_path),
        })


@tool
def extract_pdf_ocr(
    pdf_path: str,
    output_dir: str | None = None,
    languages: list[str] | None = None,
    page_numbers: list[int] | None = None,
    gpu: bool = False,
) -> str:
    """
    Extract text from scanned PDF using OCR.
    
    Args:
        pdf_path: Path to PDF file (scanned/image-based)
        output_dir: Where to save results
        languages: OCR language codes (default: ["en"])
        page_numbers: Specific pages to process
        gpu: Whether to use GPU for OCR
        
    Returns:
        JSON string with OCR results
    """
    if not EASYOCR_AVAILABLE:
        return json.dumps({
            "error": "EasyOCR not installed. Run: pip install easyocr"
        })
    
    if not PYMUPDF_AVAILABLE:
        return json.dumps({
            "error": "PyMuPDF not installed. Run: pip install pymupdf"
        })
    
    pdf_path = Path(pdf_path).resolve()
    languages = languages or ["en"]
    
    if not pdf_path.exists():
        return json.dumps({"error": f"PDF not found: {pdf_path}"})
    
    # Initialize EasyOCR reader
    try:
        reader = easyocr.Reader(languages, gpu=gpu)
    except Exception as e:
        return json.dumps({"error": f"Failed to initialize OCR: {str(e)}"})
    
    results: list[dict] = []
    
    try:
        with fitz.open(pdf_path) as doc:
            total_pages = len(doc)
            pages_to_process = page_numbers or range(total_pages)
            
            for page_idx in pages_to_process:
                if page_idx >= total_pages:
                    continue
                
                page = doc[page_idx]
                page_num = page_idx + 1
                
                # Render page at 2x zoom for better OCR
                mat = fitz.Matrix(2, 2)
                pix = page.get_pixmap(matrix=mat)
                img_data = pix.tobytes("png")
                
                # Run OCR
                ocr_result = reader.readtext(img_data, paragraph=False)
                
                # Parse results
                text_lines = []
                for detection in ocr_result:
                    bbox, text, conf = detection
                    text_lines.append({
                        "text": text,
                        "confidence": float(conf),
                        "bbox": bbox,
                    })
                
                page_result = {
                    "page_number": page_num,
                    "ocr_lines": text_lines,
                    "extracted_text": "\n".join(line["text"] for line in text_lines),
                    "line_count": len(text_lines),
                }
                results.append(page_result)
        
        output = {
            "success": True,
            "pdf_path": str(pdf_path),
            "ocr_engine": "easyocr",
            "languages": languages,
            "pages_processed": len(results),
            "pages": results,
        }
        
        # Save to file if output_dir specified
        if output_dir:
            Path(output_dir).mkdir(parents=True, exist_ok=True)
            output_file = Path(output_dir) / f"{pdf_path.stem}_ocr.json"
            with open(output_file, "w") as f:
                json.dump(output, f, indent=2, default=str)
            output["output_file"] = str(output_file)
        
        return json.dumps(output, indent=2, default=str)
        
    except Exception as e:
        return json.dumps({
            "error": str(e),
            "pdf_path": str(pdf_path),
        })


@tool
def classify_document(
    pdf_path: str,
    sample_pages: int = 3,
) -> str:
    """
    Classify document and determine best extraction strategy.
    
    Analyzes document to determine:
    - Type: manual, schematic, catalog, wiring_diagram, other
    - Has text layer vs image-only (needs OCR)
    - Image density
    - Extraction strategy
    
    Args:
        pdf_path: Path to PDF file
        sample_pages: Number of pages to sample for analysis
        
    Returns:
        JSON string with document classification
    """
    if not PYMUPDF_AVAILABLE:
        return json.dumps({
            "error": "PyMuPDF not installed. Run: pip install pymupdf"
        })
    
    pdf_path = Path(pdf_path).resolve()
    
    if not pdf_path.exists():
        return json.dumps({"error": f"PDF not found: {pdf_path}"})
    
    try:
        with fitz.open(pdf_path) as doc:
            total_pages = len(doc)
            sample_size = min(sample_pages, total_pages)
            pages_to_check = [int(i * total_pages / sample_size) for i in range(sample_size)]
            
            text_layer_pages = 0
            image_pages = 0
            total_images = 0
            
            metadata = doc.metadata or {}
            
            for page_idx in pages_to_check:
                page = doc[page_idx]
                text = page.get_text().strip()
                if len(text) > 50:
                    text_layer_pages += 1
                
                images = page.get_images()
                if images:
                    image_pages += 1
                    total_images += len(images)
            
            # Determine document type from filename
            filename = pdf_path.name.lower()
            doc_type = "general"
            keywords = {
                "manual": ["manual", "instruction", "guide"],
                "schematic": ["schematic", "diagram", "drawing"],
                "catalog": ["catalog", "parts", "bom", "list"],
                "wiring": ["wiring", "cable", "terminal"],
                "spec": ["spec", "specification", "datasheet"],
            }
            
            for dtype, kw_list in keywords.items():
                if any(kw in filename for kw in kw_list):
                    doc_type = dtype
                    break
            
            # Determine extraction strategy
            if text_layer_pages == 0:
                strategy = "ocr_only"
            elif image_pages == 0:
                strategy = "text_only"
            else:
                strategy = "hybrid"
            
            result = {
                "success": True,
                "pdf_path": str(pdf_path),
                "filename": filename,
                "document_type": doc_type,
                "total_pages": total_pages,
                "sampled_pages": sample_size,
                "has_text_layer": text_layer_pages > 0,
                "text_layer_coverage": f"{text_layer_pages}/{sample_size}",
                "has_images": total_images > 0,
                "image_pages": image_pages,
                "pdf_metadata": {
                    "title": metadata.get("title"),
                    "author": metadata.get("author"),
                    "creator": metadata.get("creator"),
                    "creation_date": metadata.get("creationDate"),
                },
                "recommended_strategy": strategy,
                "recommendations": [],
            }
            
            if strategy == "ocr_only":
                result["recommendations"].append(
                    "Document appears to be scanned. Use extract_pdf_ocr for text extraction."
                )
            elif strategy == "hybrid":
                result["recommendations"].append(
                    "Document has both text and images. Use extract_pdf_text + extract_pdf_images."
                )
            
            if doc_type in ["schematic", "wiring"]:
                result["recommendations"].append(
                    "Technical diagram detected. Consider high-res image extraction and zoom control."
                )
            
            return json.dumps(result, indent=2, default=str)
            
    except Exception as e:
        return json.dumps({
            "error": str(e),
            "pdf_path": str(pdf_path),
        })


@tool
def extract_technical_metadata(
    pdf_path: str,
    output_dir: str | None = None,
) -> str:
    """
    Extract technical metadata from engineering documents.
    
    Extracts:
    - Document numbers (drawing numbers, part numbers)
    - Revision/version info
    - Title block information
    - BOM references
    - Date information
    
    Args:
        pdf_path: Path to PDF file
        output_dir: Where to save extracted metadata
        
    Returns:
        JSON string with technical metadata
    """
    # First get text content
    text_result = extract_pdf_text(pdf_path, extract_tables=True, output_dir=output_dir)
    text_data = json.loads(text_result)
    
    if "error" in text_data:
        return text_result
    
    # Combine all text for pattern matching
    all_text = "\n".join(
        page.get("text", "") for page in text_data.get("pages", [])
    )
    
    metadata: dict[str, Any] = {
        "document_numbers": [],
        "revisions": [],
        "dates": [],
        "part_numbers": [],
        "bom_references": [],
        "extracted_patterns": {},
    }
    
    # Document number patterns
    doc_patterns = [
        r'(?:Doc\.?\s*No\.?|Document\s*Number|Drawing\s*No\.?|Drwg\.?\s*No\.?)[:\s]*([A-Z0-9\-]{5,30})',
        r'(?:Sheet|Page)\s*\d+\s*of\s*\d+.*?([A-Z0-9\-]{5,20})',
        r'151-[A-Z0-9\-]{5,20}',  # Specific to 1650 docs
    ]
    
    for pattern in doc_patterns:
        matches = re.findall(pattern, all_text, re.IGNORECASE)
        metadata["document_numbers"].extend(matches)
    
    # Revision patterns
    rev_patterns = [
        r'(?:Rev\.?|Revision)[:\s]*([A-Z0-9]+)',
        r'(?:Rev\.?|Revision)[:\s]*Date[:\s]*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})',
    ]
    
    for pattern in rev_patterns:
        matches = re.findall(pattern, all_text, re.IGNORECASE)
        metadata["revisions"].extend(matches)
    
    # Date patterns
    date_patterns = [
        r'\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}',
        r'(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}',
        r'\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}',
    ]
    
    for pattern in date_patterns:
        matches = re.findall(pattern, all_text, re.IGNORECASE)
        metadata["dates"].extend(matches)
    
    # Part number patterns (alphanumeric codes)
    part_patterns = [
        r'(?:Part\s*No\.?|P/N)[:\s]*([A-Z0-9\-]{5,25})',
        r'\b([A-Z]{2,4}-\d{3,6}-\d{2,4}[A-Z]?)\b',  # Like MR-J3-B
    ]
    
    for pattern in part_patterns:
        matches = re.findall(pattern, all_text, re.IGNORECASE)
        metadata["part_numbers"].extend(matches)
    
    # BOM references
    if re.search(r'(?:Bill\s*of\s*Materials?|B\.?O\.?M\.?|Parts?\s*List)', all_text, re.IGNORECASE):
        metadata["has_bom"] = True
    
    # Deduplicate
    metadata["document_numbers"] = list(set(metadata["document_numbers"]))[:10]
    metadata["revisions"] = list(set(metadata["revisions"]))[:5]
    metadata["dates"] = list(set(metadata["dates"]))[:5]
    metadata["part_numbers"] = list(set(metadata["part_numbers"]))[:20]
    
    # Tables (potential BOMs)
    tables = []
    for page in text_data.get("pages", []):
        if page.get("tables"):
            tables.extend(page["tables"])
    
    metadata["tables_found"] = len(tables)
    
    result = {
        "success": True,
        "pdf_path": pdf_path,
        "metadata": metadata,
        "extraction_summary": {
            "document_numbers_found": len(metadata["document_numbers"]),
            "revisions_found": len(metadata["revisions"]),
            "tables_found": len(tables),
        },
    }
    
    if output_dir:
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        output_file = Path(output_dir) / f"{Path(pdf_path).stem}_metadata.json"
        with open(output_file, "w") as f:
            json.dump(result, f, indent=2, default=str)
        result["output_file"] = str(output_file)
    
    return json.dumps(result, indent=2, default=str)


def _result_to_dict(result: ExtractionResult) -> dict:
    """Convert ExtractionResult to dictionary for JSON serialization."""
    return {
        "document_id": result.document_id,
        "source_path": result.source_path,
        "classification": result.classification,
        "total_pages": result.total_pages,
        "total_words": result.total_words,
        "pages": [
            {
                "page_number": p.page_number,
                "text": p.text,
                "word_count": p.word_count,
                "has_text": p.has_text,
                "image_count": p.image_count,
                "tables": p.tables,
                "needs_ocr": p.needs_ocr,
            }
            for p in result.pages
        ],
        "output_dir": result.output_dir,
    }


def _extract_images_from_page(
    page: fitz.Page,
    output_dir: Path,
    page_num: int,
    min_width: int,
    min_height: int,
) -> list[ExtractedImage]:
    """Helper to extract images from a single page."""
    images: list[ExtractedImage] = []
    image_list = page.get_images(full=True)
    
    for img_idx, img in enumerate(image_list, 1):
        xref = img[0]
        base_image = page.parent.extract_image(xref)
        
        if not base_image:
            continue
        
        width = base_image.get("width", 0)
        height = base_image.get("height", 0)
        
        # Filter by size
        if width < min_width or height < min_height:
            continue
        
        ext = base_image["ext"]
        image_bytes = base_image["image"]
        
        filename = f"page-{page_num:03d}_img-{img_idx:03d}.{ext}"
        filepath = output_dir / filename
        
        with open(filepath, "wb") as f:
            f.write(image_bytes)
        
        images.append(ExtractedImage(
            page_number=page_num,
            image_index=img_idx,
            extension=ext,
            width=width,
            height=height,
            size_bytes=len(image_bytes),
            image_path=str(filepath),
        ))
    
    return images


# Export all tools
__all__ = [
    "extract_pdf_text",
    "extract_pdf_images",
    "extract_pdf_ocr",
    "classify_document",
    "extract_technical_metadata",
]
