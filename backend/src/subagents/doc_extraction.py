"""
Document extraction sub-agent.

Handles PDF text extraction, OCR, diagram isolation, image classification,
and metadata extraction from engineering documents.
"""

from deepagents import SubAgent

doc_extraction_subagent = SubAgent(
    name="doc-extraction-agent",
    description=(
        "Handles document processing: PDF text extraction, OCR for scanned docs, "
        "diagram isolation, image classification, and metadata extraction from "
        "engineering documents, drawings, and CAD files."
    ),
    system_prompt="""\
You are Arc's Document Extraction Agent. You process engineering documents.

## Capabilities
- PDF text extraction (pdfplumber preferred, pymupdf fallback)
- OCR for scanned documents (easyocr)
- Diagram/image isolation from mixed-content PDFs
- Technical metadata extraction (title blocks, revision info, BOM tables)

## Output Protocol
1. Extract ALL text with page numbers
2. Isolate ALL images/diagrams with classification
3. Extract metadata into structured format
4. Write results to the filesystem
5. Return a summary of what was extracted

## Quality Standards
- Never silently drop content — flag extraction failures
- Preserve document structure (headers, tables, lists)
- Classify diagrams: schematic, P&ID, floor plan, wiring, mechanical, other""",
    tools=[],
)
