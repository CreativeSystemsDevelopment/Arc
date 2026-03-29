"use client";

import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";

let mermaidInitialized = false;
let mermaidCounter = 0;

interface MermaidDiagramProps {
  code: string;
}

export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const diagramId = useMemo(() => {
    mermaidCounter += 1;
    return `arc-mermaid-${mermaidCounter}`;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function renderMermaid() {
      try {
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default;

        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: "dark",
            securityLevel: "strict",
            suppressErrorRendering: true,
          });
          mermaidInitialized = true;
        }

        const { svg: rawSvg } = await mermaid.render(diagramId, code);
        if (cancelled) return;

        const sanitized = DOMPurify.sanitize(rawSvg, {
          USE_PROFILES: { svg: true, svgFilters: true },
        });
        setSvg(sanitized);
        setError(null);
      } catch (renderError) {
        if (cancelled) return;
        setError(
          renderError instanceof Error
            ? renderError.message
            : "Unable to render Mermaid diagram."
        );
      }
    }

    void renderMermaid();

    return () => {
      cancelled = true;
    };
  }, [code, diagramId]);

  if (error) {
    return (
      <div className="arc-mermaid-fallback">
        <p className="arc-mermaid-label">Mermaid render failed</p>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="arc-mermaid-loading">
        <span className="arc-mermaid-dot" />
        <span>Rendering diagram...</span>
      </div>
    );
  }

  return (
    <div
      className="arc-mermaid"
      // Sanitized SVG string from DOMPurify.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
