"use client";

import { Flame, Star } from "lucide-react";
import CountUp from "./ui/CountUp";

// Charcoal hero card: architect level + streak/rating tiles.
export default function StatHeader({
  progress,
  rating,
  streak,
}: {
  progress: number;
  rating: number;
  streak: number;
}) {
  const level = levelFor(progress);
  return (
    <div className="card-dark">
      <p className="text-xs" style={{ color: "var(--on-charcoal-muted)" }}>
        Architect level
      </p>
      <p className="mt-1 text-xl font-semibold leading-tight tracking-tight">{level}</p>

      {/* progress toward next level */}
      <div className="mt-3 flex items-center gap-2">
        <div className="bar-dark flex-1">
          <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
        <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--accent-bright)" }}>
          {Math.round(progress)}%
        </span>
      </div>

      <div className="mt-4 flex gap-2.5">
        <div className="tile-dark flex-1">
          <p className="text-[11px]" style={{ color: "var(--on-charcoal-muted)" }}>
            Streak
          </p>
          <p className="mt-0.5 flex items-baseline gap-1 text-lg font-bold tabular-nums" style={{ color: "var(--accent-bright)" }}>
            <Flame size={15} className="self-center" />
            <CountUp value={streak} />
            <span className="text-[11px] font-normal" style={{ color: "var(--on-charcoal-muted)" }}>
              {streak === 1 ? "day" : "days"}
            </span>
          </p>
        </div>
        <div className="tile-dark flex-1">
          <p className="text-[11px]" style={{ color: "var(--on-charcoal-muted)" }}>
            Rating
          </p>
          <p className="mt-0.5 flex items-baseline gap-1 text-lg font-bold tabular-nums">
            <Star size={15} className="self-center fill-current" style={{ color: "var(--accent-bright)" }} />
            <CountUp value={rating} decimals={1} />
            <span className="text-[11px] font-normal" style={{ color: "var(--on-charcoal-muted)" }}>
              /5
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function levelFor(progress: number): string {
  if (progress < 20) return "Novice";
  if (progress < 40) return "Beginner";
  if (progress < 60) return "Intermediate";
  if (progress < 80) return "Advanced";
  return "Architect";
}
