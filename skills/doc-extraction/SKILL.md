---
description: Document processing skill for PDF text extraction, OCR, diagram isolation, and metadata extraction from engineering documents, schematics, and technical manuals.
triggers: extract pdf, process document, ocr scan, extract text from pdf, parse schematic, extract bom table, diagram from pdf, technical document extraction, 1650 catalog, die casting manual
---

# Document Extraction Skill

**Use when:** Processing PDFs, technical manuals, schematics, engineering drawings, or any document requiring structured data extraction.

## Overview

This skill enables structured extraction from engineering documents including:
- PDF text extraction with layout preservation
- OCR for scanned documents and images
- Diagram/image isolation from mixed-content PDFs
- Metadata extraction (title blocks, revision info, BOM tables)
- Structured output to JSON/Markdown

## Quick Start

```python
# Extract all content from a PDF
result = extract_pdf_content("/path/to/manual.pdf")

# Extract with OCR for scanned pages
result = extract_pdf_with_ocr("/path/to/scanned.pdf")

# Isolate images/diagrams from PDF
images = extract_pdf_images("/path/to/diagram.pdf", output_dir="/workspace/diagrams/")

# Extract structured metadata
metadata = extract_document_metadata("/path/to/drawing.pdf")
```

## Extraction Workflow

### 1. Document Classification

First, classify the document type to determine extraction strategy:

```python
def classify_document(pdf_path: str) -> dict:
    """Classify document and return extraction strategy."""
    # Check for text layer
    has_text = check_pdf_text_layer(pdf_path)
    
    # Check for images
    image_count = count_pdf_images(pdf_path)
    
    # Determine document category
    if "schematic" in pdf_path.lower() or "drawing" in pdf_path.lower():
        category = "schematic"
    elif "manual" in pdf_path.lower() or "instruction" in pdf_path.lower():
        category = "manual"
    elif "catalog" in pdf_path.lower() or "parts" in pdf_path.lower():
        category = "parts_catalog"
    elif "wiring" in pdf_path.lower() or "cable" in pdf_path.lower():
        category = "wiring_diagram"
    else:
        category = "general"
    
    return {
        "category": category,
        "has_text_layer": has_text,
        "image_count": image_count,
        "needs_ocr": image_count > 0 and not has_text,
        "extraction_strategy": "hybrid" if (has_text and image_count > 0) else ("text" if has_text else "ocr")
    }
```

### 2. Text Extraction

**For documents with text layer:**

```python
import pdfplumber

def extract_pdf_text(pdf_path: str) -> dict:
    """Extract text with layout preservation using pdfplumber."""
    content = []
    tables = []
    
    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            # Extract text with layout
            text = page.extract_text(layout=True)
            
            # Extract tables
            page_tables = page.extract_tables()
            if page_tables:
                tables.append({
                    "page": page_num,
                    "tables": page_tables
                })
            
            content.append({
                "page": page_num,
                "text": text,
                "word_count": len(text.split()) if text else 0
            })
    
    return {
        "pages": content,
        "tables": tables,
        "total_pages": len(content),
        "total_words": sum(p["word_count"] for p in content)
    }
```

**For scanned documents (OCR):**

```python
import easyocr
import fitz  # PyMuPDF
from PIL import Image
import io

def extract_pdf_with_ocr(pdf_path: str, lang: list = ['en']) -> dict:
    """Extract text from scanned PDF using OCR."""
    reader = easyocr.Reader(lang, gpu=False)
    content = []
    
    with fitz.open(pdf_path) as pdf:
        for page_num in range(len(pdf)):
            page = pdf[page_num]
            
            # Render page to image
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x zoom for better OCR
            img_data = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_data))
            
            # Run OCR
            results = reader.readtext(img)
            
            # Extract text with bounding boxes
            text_lines = []
            for result in results:
                bbox, text, conf = result
                text_lines.append({
                    "text": text,
                    "confidence": conf,
                    "bbox": bbox
                })
            
            content.append({
                "page": page_num + 1,
                "ocr_results": text_lines,
                "extracted_text": "\n".join([r["text"] for r in text_lines])
            })
    
    return {
        "pages": content,
        "ocr_engine": "easyocr",
        "total_pages": len(content)
    }
```

### 3. Image/Diagram Extraction

```python
def extract_pdf_images(pdf_path: str, output_dir: str, min_size: int = 100) -> list:
    """Extract all images from PDF with filtering for small icons."""
    import os
    from pathlib import Path
    
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    extracted = []
    
    with fitz.open(pdf_path) as pdf:
        for page_num in range(len(pdf)):
            page = pdf[page_num]
            image_list = page.get_images(full=True)
            
            for img_index, img in enumerate(image_list, 1):
                xref = img[0]
                base_image = pdf.extract_image(xref)
                image_bytes = base_image["image"]
                ext = base_image["ext"]
                
                # Filter by size
                width = base_image.get("width", 0)
                height = base_image.get("height", 0)
                
                if width < min_size or height < min_size:
                    continue
                
                # Save image
                filename = f"page-{page_num+1:03d}_img-{img_index:03d}.{ext}"
                filepath = os.path.join(output_dir, filename)
                
                with open(filepath, "wb") as f:
                    f.write(image_bytes)
                
                extracted.append({
                    "page": page_num + 1,
                    "filename": filename,
                    "filepath": filepath,
                    "width": width,
                    "height": height,
                    "size_bytes": len(image_bytes)
                })
    
    return extracted
```

### 4. Metadata Extraction

```python
import re

def extract_document_metadata(pdf_path: str) -> dict:
    """Extract technical metadata from engineering documents."""
    
    metadata = {
        "document_number": None,
        "revision": None,
        "title": None,
        "date": None,
        "author": None,
        "bom_items": [],
    }
    
    # First pass: extract from PDF metadata
    with fitz.open(pdf_path) as pdf:
        meta = pdf.metadata
        if meta:
            metadata["pdf_title"] = meta.get("title")
            metadata["pdf_author"] = meta.get("author")
            metadata["pdf_creation_date"] = meta.get("creationDate")
    
    # Second pass: pattern matching in text
    text_content = extract_pdf_text(pdf_path)
    full_text = "\n".join([p["text"] for p in text_content.get("pages", []) if p.get("text")])
    
    # Common patterns for technical docs
    patterns = {
        "document_number": r'(?:Doc\.?\s*No\.?|Document\s*Number|Drawing\s*No\.?|Part\s*No\.?)\s*[:\-]?\s*([A-Z0-9\-]+)',
        "revision": r'(?:Rev\.?|Revision)\s*[:\-]?\s*([A-Z0-9]+)',
        "date": r'(?:Date|Created)[:\-]?\s*(\d{1,2}[\-/]\d{1,2}[\-/]\d{2,4})',
        "title": r'^([A-Z][A-Za-z0-9\s\-]{10,100})(?:Manual|Drawing|Schematic|Diagram)',
    }
    
    for key, pattern in patterns.items():
        match = re.search(pattern, full_text, re.IGNORECASE | re.MULTILINE)
        if match:
            metadata[key] = match.group(1).strip()
    
    # BOM extraction (simple table detection)
    bom_pattern = r'(?:Part\s*No\.?|Item\s*No\.?).*?(?:Description|Part\s*Name).*?(?:Qty|Quantity)'
    if re.search(bom_pattern, full_text, re.IGNORECASE):
        metadata["has_bom"] = True
        # Extract BOM rows would be table-specific
    
    return metadata
```

### 5. Complete Pipeline

```python
def process_document(pdf_path: str, output_base_dir: str) -> dict:
    """Complete document processing pipeline."""
    from pathlib import Path
    
    doc_name = Path(pdf_path).stem
    output_dir = os.path.join(output_base_dir, doc_name)
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    # Step 1: Classify
    classification = classify_document(pdf_path)
    
    # Step 2: Extract text
    if classification["extraction_strategy"] == "ocr":
        text_result = extract_pdf_with_ocr(pdf_path)
    else:
        text_result = extract_pdf_text(pdf_path)
    
    # Step 3: Extract images
    images = extract_pdf_images(pdf_path, os.path.join(output_dir, "images"))
    
    # Step 4: Extract metadata
    metadata = extract_document_metadata(pdf_path)
    
    # Step 5: Save results
    import json
    result_path = os.path.join(output_dir, "extraction_result.json")
    result = {
        "source": pdf_path,
        "classification": classification,
        "text": text_result,
        "images": images,
        "metadata": metadata,
        "output_dir": output_dir
    }
    
    with open(result_path, "w") as f:
        json.dump(result, f, indent=2, default=str)
    
    return result
```

## Document-Specific Patterns

### Schematics and Wiring Diagrams

```python
def extract_schematic_content(pdf_path: str) -> dict:
    """Specialized extraction for schematic PDFs."""
    
    # High-res image extraction
    images = extract_pdf_images(pdf_path, "/workspace/schematics/", min_size=500)
    
    # Look for wire labels, component references
    text = extract_pdf_text(pdf_path)
    
    # Pattern: Component references (R1, C2, U3, etc.)
    component_refs = re.findall(r'\b([A-Z][0-9]{1,4})\b', text["extracted_text"])
    
    # Pattern: Wire numbers
    wire_numbers = re.findall(r'\b([0-9]{2,4})\b', text["extracted_text"])
    
    return {
        "type": "schematic",
        "images": images,
        "component_references": list(set(component_refs)),
        "wire_numbers": list(set(wire_numbers)),
        "page_count": text["total_pages"]
    }
```

### Parts Catalogs and BOMs

```python
def extract_bom_tables(pdf_path: str) -> list:
    """Extract Bill of Materials tables from catalogs."""
    import pdfplumber
    
    bom_items = []
    
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            
            for table in tables:
                # Check if table looks like a BOM
                header = [str(h).lower() if h else "" for h in table[0]]
                is_bom = any(kw in " ".join(header) for kw in 
                           ["part", "qty", "description", "item", "no"])
                
                if is_bom:
                    for row in table[1:]:
                        if any(row):  # Skip empty rows
                            bom_items.append({
                                "page": page.page_number,
                                "row": row
                            })
    
    return bom_items
```

## Output Structure

```json
{
  "source": "/path/to/1650-manual.pdf",
  "classification": {
    "category": "manual",
    "has_text_layer": true,
    "image_count": 45,
    "extraction_strategy": "hybrid"
  },
  "text": {
    "pages": [...],
    "total_pages": 120,
    "total_words": 45000
  },
  "images": [
    {
      "page": 1,
      "filename": "page-001_img-001.png",
      "width": 1200,
      "height": 800
    }
  ],
  "metadata": {
    "document_number": "151-E8810-202-0",
    "revision": "A4",
    "title": "AC SERVO MR-J3-B TECHNICAL MANUAL"
  },
  "output_dir": "/workspace/extracted/1650-manual/"
}
```

## Dependencies

```bash
pip install pdfplumber pymupdf easyocr pillow
```

## Integration with Arc

When processing documents with Arc:

1. Use `write_todos` to track multi-document batches
2. Delegate extraction to `task` subagent for parallel processing
3. Store results in `/workspace/extracted/`
4. Write reflections on extraction quality for pattern learning
5. Create specialized skills for recurring document types

## Edge Cases

- **Password-protected PDFs**: Request password or flag for manual review
- **Corrupted PDFs**: Use PyMuPDF as fallback, log errors
- **Very large PDFs**: Stream pages one at a time
- **Complex layouts**: Use table detection for structured content
- **Multi-language**: Specify OCR language codes
