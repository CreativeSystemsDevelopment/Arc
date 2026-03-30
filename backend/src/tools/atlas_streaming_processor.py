"""
Streaming document processor for Atlas 1650.

Handles large documents by processing in chunks without loading fully into memory.
Writes results incrementally to avoid timeouts.
"""

from __future__ import annotations

import json
import os
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4

from langchain.tools import tool


def normalize_fullwidth(text: str) -> str:
    """Convert fullwidth characters to standard ASCII."""
    fullwidth = "０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ－"
    normal = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-"
    return text.translate(str.maketrans(fullwidth, normal))


@dataclass
class ChunkResult:
    """Result from processing a chunk of documents."""
    processed: list[dict] = field(default_factory=list)
    failed: list[dict] = field(default_factory=list)
    checkpoint_file: str | None = None


class StreamingAtlasProcessor:
    """Streaming processor for large document sets."""
    
    CATALOG_PATH = Path("/home/eshan/extraction_docs/extraction_docs/1650-1_3022/1650 CATALOG/")
    OUTPUT_BASE = Path("/home/eshan/arc/Arc/workspace/atlas/1650-extraction/")
    CHECKPOINT_FILE = OUTPUT_BASE / "extraction_checkpoint.json"
    
    def __init__(self) -> None:
        self.OUTPUT_BASE.mkdir(parents=True, exist_ok=True)
        self._load_checkpoint()
    
    def _load_checkpoint(self) -> None:
        """Load progress from checkpoint file."""
        if self.CHECKPOINT_FILE.exists():
            with open(self.CHECKPOINT_FILE) as f:
                self.state = json.load(f)
        else:
            self.state = {
                "started_at": datetime.now().isoformat(),
                "completed": [],
                "failed": [],
                "in_progress": []
            }
    
    def _save_checkpoint(self) -> None:
        """Save current progress."""
        with open(self.CHECKPOINT_FILE, "w") as f:
            json.dump(self.state, f, indent=2, default=str)
    
    def get_pending_documents(self) -> list[Path]:
        """Get list of documents not yet processed."""
        all_pdfs = sorted(self.CATALOG_PATH.glob("*.pdf"))
        completed_names = {c["filename"] for c in self.state["completed"]}
        failed_names = {f["filename"] for f in self.state["failed"]}
        processed = completed_names | failed_names
        return [p for p in all_pdfs if p.name not in processed]
    
    def process_single(self, pdf_path: Path, max_pages: int | None = None) -> dict[str, Any]:
        """Process a single document, optionally limiting pages."""
        try:
            import pdfplumber
        except ImportError:
            return {"error": "pdfplumber not installed"}
        
        filename = pdf_path.name
        doc_type = self._get_document_type(filename)
        doc_id = str(uuid4())[:8]
        
        try:
            with pdfplumber.open(pdf_path) as pdf:
                total_pages = len(pdf.pages)
                pages_to_process = max_pages if max_pages else total_pages
                
                # Process pages
                page_texts = []
                total_words = 0
                has_images = False
                
                for i in range(min(pages_to_process, total_pages)):
                    page = pdf.pages[i]
                    text = page.extract_text(layout=True) or ""
                    normalized = normalize_fullwidth(text)
                    words = len(normalized.split())
                    total_words += words
                    
                    if text.strip():
                        page_texts.append({
                            "page": i + 1,
                            "text_preview": normalized[:500] if normalized else "",
                            "word_count": words
                        })
                    
                    if page.images:
                        has_images = True
                
                # Extract metadata from first page
                metadata = self._extract_metadata(page_texts[0]["text_preview"] if page_texts else "")
                
                result = {
                    "document_id": doc_id,
                    "filename": filename,
                    "document_type": doc_type,
                    "total_pages": total_pages,
                    "pages_processed": len(page_texts),
                    "word_count": total_words,
                    "has_images": has_images,
                    "metadata": metadata,
                    "page_samples": page_texts[:3],  # First 3 pages
                    "extracted_at": datetime.now().isoformat(),
                    "status": "success"
                }
                
                # Save individual result
                output_file = self.OUTPUT_BASE / f"{doc_id}_{filename.replace('.pdf', '.json')}"
                with open(output_file, "w") as f:
                    json.dump(result, f, indent=2, default=str)
                result["output_file"] = str(output_file)
                
                return result
                
        except Exception as e:
            return {
                "document_id": doc_id,
                "filename": filename,
                "error": str(e),
                "status": "failed"
            }
    
    def _get_document_type(self, filename: str) -> str:
        """Determine document type from filename."""
        fname = filename.lower()
        patterns = [
            (r'.*schematic.*', 'schematic'),
            (r'.*wiring.*', 'wiring_diagram'),
            (r'.*cable.*list.*', 'cable_list'),
            (r'.*parts?.*list.*', 'parts_list'),
            (r'.*manual.*', 'manual'),
            (r'.*instruction.*', 'instruction'),
            (r'.*parameter.*', 'parameter_list'),
            (r'.*error.*list.*', 'error_list'),
            (r'.*setting.*list.*', 'setting_list'),
            (r'.*outline.*', 'outline'),
            (r'.*arrangement.*', 'arrangement'),
        ]
        for pattern, dtype in patterns:
            if re.match(pattern, fname):
                return dtype
        return "general"
    
    def _extract_metadata(self, text: str) -> dict[str, Any]:
        """Extract metadata from text."""
        metadata = {}
        
        # Document number pattern
        doc_match = re.search(r'(151-[A-Z0-9]{3,8}-[0-9]{3,4}-?[0-9A-Z]?)', text)
        if doc_match:
            metadata["document_number"] = doc_match.group(1)
        
        # Customer
        if 'AISIN' in text.upper():
            metadata["customer"] = "AISIN AUTOMOTIVE CASTING, LLC"
        
        # Machine model
        if 'UH1650' in text.upper() or '1650' in text:
            metadata["machine_model"] = "UH1650 DIE CASTING MACHINE"
        
        # Title extraction - look for keywords
        lines = text.split('\n')[:20]
        title_keywords = ['TITLE', 'DESCRIPTION', '機械名', 'NAME OF MACHINE']
        for line in lines:
            for keyword in title_keywords:
                if keyword in line.upper():
                    # Try to get next meaningful text
                    potential_title = line.split(keyword)[-1][:80].strip()
                    if len(potential_title) > 10:
                        metadata["title_hint"] = potential_title
                        break
        
        return metadata
    
    def process_chunk(self, chunk_size: int = 3) -> ChunkResult:
        """Process a chunk of documents."""
        pending = self.get_pending_documents()
        chunk = pending[:chunk_size]
        
        if not chunk:
            return ChunkResult(processed=[], failed=[], checkpoint_file=str(self.CHECKPOINT_FILE))
        
        result = ChunkResult(processed=[], failed=[])
        
        for pdf_path in chunk:
            # Limit large documents to first 50 pages for speed
            max_pages = 50 if pdf_path.stat().st_size > 2_000_000 else None
            
            doc_result = self.process_single(pdf_path, max_pages=max_pages)
            
            if doc_result.get("status") == "success":
                self.state["completed"].append(doc_result)
                result.processed.append(doc_result)
            else:
                self.state["failed"].append(doc_result)
                result.failed.append(doc_result)
        
        self._save_checkpoint()
        result.checkpoint_file = str(self.CHECKPOINT_FILE)
        
        return result
    
    def get_progress(self) -> dict[str, Any]:
        """Get current extraction progress."""
        all_pdfs = list(self.CATALOG_PATH.glob("*.pdf"))
        total = len(all_pdfs)
        completed = len(self.state["completed"])
        failed = len(self.state["failed"])
        pending = total - completed - failed
        
        # Collect stats
        total_words = sum(c.get("word_count", 0) for c in self.state["completed"])
        docs_with_images = sum(1 for c in self.state["completed"] if c.get("has_images"))
        
        # Document types processed
        by_type = defaultdict(int)
        for doc in self.state["completed"]:
            by_type[doc.get("document_type", "unknown")] += 1
        
        return {
            "total_documents": total,
            "completed": completed,
            "failed": failed,
            "pending": pending,
            "percent_complete": round((completed / total * 100), 1) if total > 0 else 0,
            "total_words_extracted": total_words,
            "documents_with_images": docs_with_images,
            "by_type": dict(by_type),
            "last_updated": datetime.now().isoformat(),
        }


@tool
def start_streaming_extraction(chunk_size: int = 3) -> str:
    """
    Start streaming extraction of Atlas 1650 documents.
    
    Processes documents in chunks to avoid timeouts.
    Uses checkpoint/resume for reliability.
    
    Args:
        chunk_size: Number of documents to process per call (default: 3)
        
    Returns:
        JSON with progress and next steps
    """
    processor = StreamingAtlasProcessor()
    
    # Get initial progress
    before_progress = processor.get_progress()
    
    if before_progress["pending"] == 0:
        return json.dumps({
            "status": "complete",
            "message": "All documents already processed",
            "progress": before_progress
        }, indent=2, default=str)
    
    # Process chunk
    chunk_result = processor.process_chunk(chunk_size=chunk_size)
    
    # Get updated progress
    after_progress = processor.get_progress()
    
    result = {
        "status": "running",
        "chunk_processed": len(chunk_result.processed),
        "chunk_failed": len(chunk_result.failed),
        "checkpoint_file": chunk_result.checkpoint_file,
        "progress": after_progress,
        "just_completed": [
            {"filename": d["filename"], "words": d.get("word_count", 0)}
            for d in chunk_result.processed
        ],
        "next_action": "Continue calling start_streaming_extraction until pending=0"
    }
    
    return json.dumps(result, indent=2, default=str)


@tool
def get_extraction_progress() -> str:
    """
    Get current extraction progress.
    
    Returns:
        JSON with detailed progress information
    """
    processor = StreamingAtlasProcessor()
    progress = processor.get_progress()
    
    # Add document samples
    if processor.state["completed"]:
        recent = sorted(
            processor.state["completed"],
            key=lambda x: x.get("extracted_at", ""),
            reverse=True
        )[:5]
        progress["recent_completions"] = [
            {
                "filename": d["filename"],
                "type": d.get("document_type"),
                "pages": d.get("pages_processed"),
                "words": d.get("word_count"),
            }
            for d in recent
        ]
    
    return json.dumps(progress, indent=2, default=str)


@tool
def get_document_content(document_id: str) -> str:
    """
    Retrieve extracted content for a specific document.
    
    Args:
        document_id: The document ID (8-char)
        
    Returns:
        JSON with document content
    """
    output_base = Path("/home/eshan/arc/Arc/workspace/atlas/1650-extraction/")
    
    # Find file
    for json_file in output_base.glob(f"{document_id}_*.json"):
        with open(json_file) as f:
            content = json.load(f)
        return json.dumps(content, indent=2, default=str)
    
    return json.dumps({"error": f"Document {document_id} not found"})


@tool
def query_extracted_documents(document_type: str | None = None, has_images: bool | None = None) -> str:
    """
    Query extracted documents by criteria.
    
    Args:
        document_type: Filter by type (schematic, cable_list, etc.)
        has_images: Filter by image presence
        
    Returns:
        JSON with matching documents
    """
    processor = StreamingAtlasProcessor()
    
    matches = []
    for doc in processor.state["completed"]:
        if document_type and doc.get("document_type") != document_type:
            continue
        if has_images is not None and doc.get("has_images") != has_images:
            continue
        matches.append({
            "id": doc["document_id"],
            "filename": doc["filename"],
            "type": doc.get("document_type"),
            "pages": doc.get("pages_processed"),
            "words": doc.get("word_count"),
            "output_file": doc.get("output_file")
        })
    
    return json.dumps({
        "matches": len(matches),
        "documents": matches
    }, indent=2, default=str)


__all__ = [
    "start_streaming_extraction",
    "get_extraction_progress",
    "get_document_content",
    "query_extracted_documents",
    "StreamingAtlasProcessor",
]
