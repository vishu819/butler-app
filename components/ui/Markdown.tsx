import React from "react";

// Tiny Markdown renderer: ## headings, - / * bullets, **bold**. Shared across
// Library and Feed so summaries/articles render consistently.
export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={`ul${out.length}`} className="my-1 list-disc pl-5 text-sm" style={{ color: "var(--muted)" }}>
          {list.map((li, i) => (
            <li key={i}>{inline(li)}</li>
          ))}
        </ul>
      );
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return flush();
    if (line.startsWith("## ")) {
      flush();
      out.push(
        <h4 key={`h${i}`} className="mt-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
          {line.slice(3)}
        </h4>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      list.push(line.slice(2));
    } else {
      flush();
      out.push(
        <p key={`p${i}`} className="my-1 text-sm" style={{ color: "var(--ink)" }}>
          {inline(line)}
        </p>
      );
    }
  });
  flush();
  return <div>{out}</div>;
}

function inline(s: string): React.ReactNode {
  return s
    .split(/(\*\*[^*]+\*\*)/g)
    .map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
    );
}
