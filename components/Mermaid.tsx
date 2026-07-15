"use client";

import { useEffect, useRef, useState } from "react";
import type { Mermaid as MermaidAPI } from "mermaid";

// Mermaid is a large (~500KB) library only needed when a diagram is shown, so it
// is loaded lazily via dynamic import() — this keeps it OUT of the main bundle
// (it was previously statically imported and shipped on every page).
let mermaidPromise: Promise<MermaidAPI> | null = null;
let initialized = false;
let renderCounter = 0;

function loadMermaid(): Promise<MermaidAPI> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      const mermaid = m.default;
      if (!initialized) {
        mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
        initialized = true;
      }
      return mermaid;
    });
  }
  return mermaidPromise;
}

export default function Mermaid({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const idRef = useRef(`mermaid-${renderCounter++}`);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      setError(false);
      try {
        const mermaid = await loadMermaid();
        const { svg } = await mermaid.render(idRef.current, chart);
        if (!cancelled) setSvg(svg);
      } catch {
        if (!cancelled) {
          setSvg(null);
          setError(true);
        }
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return <p className="text-sm text-gray-400">Diagram unavailable</p>;
  }

  return (
    <div
      className="max-w-full overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
