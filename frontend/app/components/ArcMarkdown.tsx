"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { MermaidDiagram } from "./MermaidDiagram";

export function ArcMarkdown({ content }: { content: string }) {
  const components: Components = {
    code({ className, children, ...props }) {
      const language = className?.replace("language-", "").trim();
      const rawCode = String(children ?? "").replace(/\n$/, "");

      if (language === "mermaid") {
        return <MermaidDiagram code={rawCode} />;
      }

      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    img({ src = "", alt = "" }) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="arc-inline-image"
        />
      );
    },
  };

  return (
    <div className="prose-agent max-w-none text-[0.95rem] text-slate-100">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
