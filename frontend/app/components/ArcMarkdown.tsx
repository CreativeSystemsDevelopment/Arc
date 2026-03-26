"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function ArcMarkdown({ content }: { content: string }) {
  return (
    <div className="prose-agent max-w-none text-[0.95rem] text-slate-100">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
