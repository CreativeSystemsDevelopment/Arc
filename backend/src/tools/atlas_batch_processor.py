"""
Atlas Platform Batch Document Processor.

Processes the 1650 die-casting machine documentation set:
- 24 PDF manuals and catalogs
- 129 schematic images
- Extracts structured data, metadata, BOMs, and diagrams
- Builds digital replica for engineering knowledge base
"""

from __future__ import annotations

import json
import os
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from langchain.tools import tool


def normalize_fullwidth(text: str) -> str:
    """Convert fullwidth characters to standard ASCII for pattern matching."""
    fullwidth = "０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ－"
    normal = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-"
    return text.translate(str.maketrans(fullwidth, normal))


@dataclass
class DocumentEntry:
    """Represents an extracted document with metadata."""
    document_id: str
    source_path: Path
    document_type: str = "unknown"
    title: str | None = None
    document_number: str | None = None
    revision: str | None = None
    page_count: int = 0
    word_count: int = 0
    image_count: int = 0
    extracted_at: datetime = field(default_factory=datetime.now)
    content_summary: dict = field(default_factory=dict)
    metadata: dict = field(default_factory=dict)
    extraction_status: str = "pending"


class Atlas1650Processor:
    """Processor for the 1650 die-casting machine documentation."""
    
    CATALOG_PATH = Path("/home/eshan/extraction_docs/extraction_docs/1650-1_3022/1650 CATALOG/")
    OUTPUT_BASE = Path("/home/eshan/arc/Arc/workspace/atlas/1650-extraction/")
    
    # Document types based on filename patterns
    DOC_TYPE_PATTERNS = {
        r'.*schematic.*': 'schematic',
        r'.*wiring.*': 'wiring_diagram',
        r'.*cable.*list.*': 'cable_list',
        r'.*parts?.*list.*': 'parts_list',
        r'.*bom.*': 'bom',
        r'.*manual.*': 'manual',
        r'.*instruction.*': 'instruction',
        r'.*parameter.*': 'parameter_list',
        r'.*error.*list.*': 'error_list',
        r'.*setting.*list.*': 'setting_list',
        r'.*outline.*': 'outline',
        r'.*arrangement.*': 'arrangement',
        r'content.*': 'table_of_contents',
    }
    
    def __init__(self) -> None:
        self.documents: list[DocumentEntry] = []
        self.extraction_log: list[dict] = []
        self.OUTPUT_BASE.mkdir(parents=True, exist_ok=True)
        
        # Ensure pdfplumber is available
        try:
            import pdfplumber
            self.has_pdfplumber = True
        except ImportError:
            self.has_pdfplumber = False
            self.extraction_log.append({
                "level": "error",
                "message": "pdfplumber not installed. Run: pip install pdfplumber"
            })
    
    def get_document_type(self, filename: str) -> str:
        """Determine document type from filename."""
        filename_lower = filename.lower()
        for pattern, doc_type in self.DOC_TYPE_PATTERNS.items():
            if re.match(pattern, filename_lower):
                return doc_type
        return "general"
    
    def extract_document_metadata(self, pdf_path: Path) -> dict[str, Any]:
        """Extract metadata from PDF using pdfplumber."""
        if not self.has_pdfplumber:
            return {"error": "pdfplumber not available"}
        
        import pdfplumber
        
        try:
            with pdfplumber.open(pdf_path) as pdf:
                # Sample first few pages for metadata
                sample_text = ""
                for i, page in enumerate(pdf.pages[:5]):
                    text = page.extract_text(layout=True) or ""
                    sample_text += text + "\n"
                
                # Extract patterns
                normalized = normalize_fullwidth(sample_text)
                
                metadata = {
                    "title": self._extract_title(normalized),
                    "document_number": self._extract_doc_number(normalized),
                    "revision": self._extract_revision(normalized),
                    "dates": self._extract_dates(normalized),
                    "customer": self._extract_customer(normalized),
                    "machine_model": self._extract_machine_model(normalized),
                }
                
                return metadata
                
        except Exception as e:
            return {"error": str(e)}
    
    def _extract_title(self, text: str) -> str | None:
        """Extract document title from text."""
        # Look for title patterns
        patterns = [
            r'TITLE[^\n]{0,50}([^\n]{10,100})',
            r'DESCRIPTION[^\n]{0,30}([^\n]{10,100})',
            r'機械名[^\n]{0,30}([^\n]{5,50})',  # Machine name in Japanese
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return None
    
    def _extract_doc_number(self, text: str) -> str | None:
        """Extract document/drawing number."""
        # Pattern for 151-XXXXX-XXX-X format
        pattern = r'(151-[A-Z0-9]{3,8}-[0-9]{3,4}-?[0-9A-Z]?)'
        match = re.search(pattern, text)
        if match:
            return match.group(1)
        
        # Pattern for DWG No
        pattern = r'DWG\s*NO\.?\s*([0-9A-Z\-]+)'
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
        
        return None
    
    def _extract_revision(self, text: str) -> str | None:
        """Extract revision information."""
        pattern = r'(?:Rev\.?|Revision)[^A-Z0-9]{0,5}([A-Z0-9]+)'
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
        return None
    
    def _extract_dates(self, text: str) -> list[str]:
        """Extract date information."""
        dates = []
        # Sep.12.'14 format
        pattern = r'([A-Z][a-z]{2}\.\s*\d{1,2}\.[\'\"]\d{2})'
        dates.extend(re.findall(pattern, text))
        return dates[:5]  # Limit to 5
    
    def _extract_customer(self, text: str) -> str | None:
        """Extract customer name."""
        # AISIN pattern
        if 'AISIN' in text.upper():
            return "AISIN AUTOMOTIVE CASTING, LLC"
        return None
    
    def _extract_machine_model(self, text: str) -> str | None:
        """Extract machine model."""
        # UH1650 pattern
        pattern = r'(UH\s*1650|UH1650)'
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return "UH1650 DIE CASTING MACHINE"
        return None
    
    def process_single_document(self, pdf_path: Path) -> DocumentEntry | None:
        """Process a single PDF document."""
        if not self.has_pdfplumber:
            return None
        
        import pdfplumber
        
        doc_id = str(uuid4())[:8]
        doc_type = self.get_document_type(pdf_path.name)
        
        # Check file size for progress tracking
        file_size = pdf_path.stat().st_size if pdf_path.exists() else 0
        
        try:
            with pdfplumber.open(pdf_path) as pdf:
                page_count = len(pdf.pages)
                
                # Extract text from all pages
                total_words = 0
                total_images = 0
                text_by_page = []
                
                for i, page in enumerate(pdf.pages):
                    text = page.extract_text(layout=True) or ""
                    words = len(text.split()) if text else 0
                    total_words += words
                    total_images += len(page.images)
                    
                    text_by_page.append({
                        "page": i + 1,
                        "word_count": words,
                        "has_text": bool(text and len(text.strip()) > 10),
                    })
                
                # Extract metadata
                metadata = self.extract_document_metadata(pdf_path)

                return DocumentEntry(
                    document_id=doc_id,
                    source_path=pdf_path,
                    document_type=doc_type,
                    title=metadata.get("title"),
                    document_number=metadata.get("document_number"),
                    revision=metadata.get("revision"),
                    page_count=page_count,
                    word_count=total_words,
                    image_count=total_images,
                    content_summary={
                        "pages_with_text": sum(1 for p in text_by_page if p["has_text"]),
                        "text_by_page": text_by_page[:5],  # Sample
                    },
                    metadata=metadata,
                    extraction_status="success",
                )
                
        except Exception as e:
            return DocumentEntry(
                document_id=doc_id,
                source_path=pdf_path,
                document_type=doc_type,
                extraction_status=f"error: {str(e)[:100]}",
            )
    
    def run_batch_extraction(self) -> dict[str, Any]:
        """Run batch extraction on all documents."""
        if not self.CATALOG_PATH.exists():
            return {"error": f"Catalog path not found: {self.CATALOG_PATH}"}
        
        # Find all PDFs
        pdf_files = sorted([f for f in self.CATALOG_PATH.glob("*.pdf")])
        
        if not pdf_files:
            return {"error": "No PDF files found in catalog"}
        
        results = {
            "started_at": datetime.now().isoformat(),
            "total_pdfs": len(pdf_files),
            "processed": 0,
            "successful": 0,
            "failed": 0,
            "documents": [],
            "by_type": defaultdict(list),
        }
        
        for i, pdf_path in enumerate(pdf_files, 1):
            print(f"[{i}/{len(pdf_files)}] Processing: {pdf_path.name}")
            
            entry = self.process_single_document(pdf_path)
            if entry:
                self.documents.append(entry)
                results["processed"] += 1
                
                if entry.extraction_status == "success":
                    results["successful"] += 1
                else:
                    results["failed"] += 1
                
                results["documents"].append({
                    "id": entry.document_id,
                    "name": pdf_path.name,
                    "type": entry.document_type,
                    "pages": entry.page_count,
                    "words": entry.word_count,
                    "number": entry.document_number,
                    "status": entry.extraction_status,
                })
                
                results["by_type"][entry.document_type].append({
                    "id": entry.document_id,
                    "name": pdf_path.name,
                })
        
        results["completed_at"] = datetime.now().isoformat()
        
        # Save results
        output_file = self.OUTPUT_BASE / "extraction_manifest.json"
        with open(output_file, "w") as f:
            json.dump(results, f, indent=2, default=str)
        
        return results


@tool
def process_atlas_1650_catalog(output_dir: str | None = None) -> str:
    """
    Process all 1650 die-casting machine documents.
    
    Extracts structured data from the complete documentation set:
    - Schematics and wiring diagrams
    - Cable lists and parts catalogs
    - Manuals and instruction guides
    - Parameter and setting lists
    
    Args:
        output_dir: Where to save extraction results
        
    Returns:
        JSON string with extraction manifest
    """
    processor = Atlas1650Processor()
    
    if output_dir:
        processor.OUTPUT_BASE = Path(output_dir)
        processor.OUTPUT_BASE.mkdir(parents=True, exist_ok=True)
    
    results = processor.run_batch_extraction()
    
    return json.dumps(results, indent=2, default=str)


@tool
def get_document_inventory() -> str:
    """
    Get inventory of all 1650 documents.
    
    Returns:
        JSON string with document inventory
    """
    catalog_path = Path("/home/eshan/extraction_docs/extraction_docs/1650-1_3022/1650 CATALOG/")
    
    if not catalog_path.exists():
        return json.dumps({"error": f"Catalog not found: {catalog_path}"})
    
    pdf_files = sorted([f for f in catalog_path.glob("*.pdf")])
    
    inventory = []
    for pdf_path in pdf_files:
        size_mb = pdf_path.stat().st_size / (1024 * 1024)
        
        # Determine type from filename
        filename_lower = pdf_path.name.lower()
        doc_type = "general"
        patterns = {
            'schematic': 'schematic',
            'wiring': 'wiring_diagram',
            'cable': 'cable_list',
            'parts': 'parts_list',
            'manual': 'manual',
            'instruction': 'instruction',
            'parameter': 'parameter_list',
            'error': 'error_list',
            'setting': 'setting_list',
            'outline': 'outline',
            'arrangement': 'arrangement',
        }
        for keyword, dtype in patterns.items():
            if keyword in filename_lower:
                doc_type = dtype
                break
        
        inventory.append({
            "filename": pdf_path.name,
            "document_type": doc_type,
            "size_mb": round(size_mb, 2),
            "path": str(pdf_path),
        })
    
    return json.dumps({
        "catalog_path": str(catalog_path),
        "total_documents": len(inventory),
        "documents": inventory,
    }, indent=2, default=str)


@tool
def extract_document_by_number(document_number: str, output_dir: str | None = None) -> str:
    """
    Extract specific document by drawing/document number.
    
    Args:
        document_number: Drawing/document number (e.g., "151-E8810-202-0")
        output_dir: Where to save extraction results
        
    Returns:
        JSON string with extraction results
    """
    catalog_path = Path("/home/eshan/extraction_docs/extraction_docs/1650-1_3022/1650 CATALOG/")
    
    if not catalog_path.exists():
        return json.dumps({"error": f"Catalog not found: {catalog_path}"})
    
    # Find PDFs matching the document number
    pdf_files = list(catalog_path.glob("*.pdf"))
    
    # Try to find match
    matching_file = None
    for pdf_path in pdf_files:
        if document_number.replace("-", "") in pdf_path.name.replace("-", ""):
            matching_file = pdf_path
            break
    
    if not matching_file:
        return json.dumps({
            "error": f"Document not found: {document_number}",
            "available_documents": [p.name for p in pdf_files[:10]],
        })
    
    # Extract
    processor = Atlas1650Processor()
    entry = processor.process_single_document(matching_file)
    
    if not entry:
        return json.dumps({"error": "Extraction failed"})
    
    result = {
        "document_number": document_number,
        "file": matching_file.name,
        "extraction": {
            "id": entry.document_id,
            "type": entry.document_type,
            "title": entry.title,
            "pages": entry.page_count,
            "words": entry.word_count,
            "metadata": entry.metadata,
            "status": entry.extraction_status,
        },
    }
    
    if output_dir:
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        output_file = Path(output_dir) / f"{entry.document_id}_extraction.json"
        with open(output_file, "w") as f:
            json.dump(result, f, indent=2, default=str)
        result["output_file"] = str(output_file)
    
    return json.dumps(result, indent=2, default=str)


__all__ = [
    "process_atlas_1650_catalog",
    "get_document_inventory",
    "extract_document_by_number",
    "Atlas1650Processor",
]
