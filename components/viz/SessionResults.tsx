"use client";

// Per-concept results after a session: MCQ correctness + written-answer depth.
type Q = { skill: string; concept: string };
type R = { qi: number; mcq_correct: boolean; followup_score: number };

export default function SessionResults({ questions, responses }: { questions: Q[]; responses: R[] }) {
  const rows = questions.map((q, i) => {
    const r = responses.find((x) => x.qi === i);
    return { concept: q.concept, mcq: r?.mcq_correct ?? null, depth: r?.followup_score ?? 0 };
  });

  const mcqRight = rows.filter((r) => r.mcq).length;
  const avgDepth = rows.length
    ? Math.round(rows.reduce((s, r) => s + r.depth, 0) / rows.length)
    : 0;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        <div className="metric flex-1">
          <div className="metric-value">
            {mcqRight}/{rows.length}
          </div>
          <div className="metric-label">Correct choices</div>
        </div>
        <div className="metric flex-1">
          <div className="metric-value" style={{ color: "var(--accent)" }}>
            {avgDepth}
          </div>
          <div className="metric-label">Avg understanding</div>
        </div>
      </div>

      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold"
              style={
                r.mcq
                  ? { background: "var(--good-soft)", color: "var(--good)" }
                  : { background: "var(--bad-soft)", color: "var(--bad)" }
              }
            >
              {r.mcq ? "✓" : "✗"}
            </span>
            <span className="min-w-0 flex-1 truncate" style={{ color: "var(--ink)" }}>
              {r.concept}
            </span>
            <div className="bar w-16 shrink-0">
              <span
                style={{
                  width: `${r.depth}%`,
                  background: r.depth >= 70 ? "var(--good)" : r.depth >= 45 ? "var(--warn)" : "var(--bad)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
