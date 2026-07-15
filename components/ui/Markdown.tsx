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

// Inline formatting: [text](url) links and **bold**. Links open in a new tab.
function inline(s: string): React.ReactNode {
  // Split on Markdown links first, then apply bold to the non-link runs.
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = linkRe.exec(s)) !== null) {
    if (m.index > last) parts.push(<React.Fragment key={key++}>{bold(s.slice(last, m.index), key)}</React.Fragment>);
    parts.push(
      <a
        key={key++}
        href={m[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline underline-offset-2"
        style={{ color: "var(--accent-ink)" }}
      >
        {m[1]}
      </a>
    );
    last = linkRe.lastIndex;
  }
  if (last < s.length) parts.push(<React.Fragment key={key++}>{bold(s.slice(last), key)}</React.Fragment>);
  return parts;
}

function bold(s: string, seed: number): React.ReactNode {
  return s
    .split(/(\*\*[^*]+\*\*)/g)
    .map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? <strong key={`${seed}-${i}`}>{p.slice(2, -2)}</strong> : <span key={`${seed}-${i}`}>{p}</span>
    );
}
