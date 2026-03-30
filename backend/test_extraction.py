#!/usr/bin/env python3
"""Test script for document extraction tools."""

import sys
import json
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from tools.doc_extraction import (
    _extract_with_pymupdf,
    _extract_with_pdfplumber,
    ExtractionResult,
)

def test_classification():
    pdf_path = Path("/home/eshan/extraction_docs/extraction_docs/1650-1_3022/1650 CATALOG/01_Schematic_151-E8810-202-0(A4).pdf")
    
    result = ExtractionResult(source_path=str(pdf_path))
    result = _extract_with_pymupdf(result, pdf_path, None, extract_tables=True)
    
    print("=" * 60)
    print("DOCUMENT CLASSIFICATION")
    print("=" * 60)
    print(f"Source: {result.source_path}")
    print(f"Document ID: {result.document_id}")
    print(f"Total Pages: {result.total_pages}")
    print(f"Total Words: {result.total_words}")
    print(f"Pages with text: {sum(1 for p in result.pages if p.has_text)}")
    print()
    
    # Show sample page content
    print("Sample Pages (first 3):")
    for page in result.pages[:3]:
        print(f"  Page {page.page_number}:")
        print(f"    Text words: {page.word_count}")
        print(f"    Has text: {page.has_text}")
        print(f"    Images: {page.image_count}")
        if page.text:
            preview = page.text[:200].replace('\n', ' ')
            print(f"    Preview: {preview}...")
        print()
    
    return result

def test_metadata_extraction():
    import re
    from dataclasses import asdict
    
    pdf_path = Path("/home/eshan/extraction_docs/extraction_docs/1650-1_3022/1650 CATALOG/01_Schematic_151-E8810-202-0(A4).pdf")
    
    result = ExtractionResult(source_path=str(pdf_path))
    result = _extract_with_pdfplumber(result, pdf_path, None, extract_tables=True)
    
    # Combine all text
    all_text = "\n".join([p.text or "" for p in result.pages])
    
    metadata = {
        "document_numbers": [],
        "revisions": [],
        "part_numbers": [],
    }
    
    # Extract document numbers
    doc_patterns = [
        r'151-[A-Z0-9\-]{5,30}',
        r'(?:Doc\.?\s*No\.?|Document\s*Number)[:\s]*([A-Z0-9\-]{5,30})',
    ]
    
    for pattern in doc_patterns:
        matches = re.findall(pattern, all_text, re.IGNORECASE)
        metadata["document_numbers"].extend(matches)
    
    # Extract revisions
    rev_pattern = r'(?:Rev\.?|Revision)[:\s]*([A-Z0-9]+)'
    metadata["revisions"] = re.findall(rev_pattern, all_text, re.IGNORECASE)
    
    # Part numbers like MR-J3-B
    part_pattern = r'\b([A-Z]{2,4}-\d{3,6}[A-Z-]*)\b'
    metadata["part_numbers"] = re.findall(part_pattern, all_text)
    
    # Deduplicate
    metadata["document_numbers"] = list(set(metadata["document_numbers"]))[:10]
    metadata["revisions"] = list(set(metadata["revisions"]))[:5]
    metadata["part_numbers"] = list(set(metadata["part_numbers"]))[:20]
    
    print("=" * 60)
    print("METADATA EXTRACTION")
    print("=" * 60)
    print(json.dumps(metadata, indent=2))
    print()
    
    return metadata

if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("ATLAS PLATFORM DOCUMENT EXTRACTION TEST")
    print("Processing 1650 Die-Casting Machine Documents")
    print("=" * 60 + "\n")
    
    try:
        result = test_classification()
        metadata = test_metadata_extraction()
        
        print("=" * 60)
        print("EXTRACTION SUMMARY")
        print("=" * 60)
        print(f"Document processed: {result.source_path}")
        print(f"Pages analyzed: {result.total_pages}")
        print(f"Total word count: {result.total_words}")
        print(f"Document numbers found: {len(metadata['document_numbers'])}")
        print(f"Part numbers found: {len(metadata['part_numbers'])}")
        print("\nExtraction pipeline ready for batch processing!")
        
    except Exception as e:
        print(f"Error during extraction: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
