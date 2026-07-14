"use client";

import { Star, Flame } from "lucide-react";
import CountUp from "./ui/CountUp";

export default function StatHeader({
  progress,
  rating,
  streak,
}: {
  progress: number;
  rating: number;
  streak: number;
}) {
  return (
    <div className="card-hero flex items-center justify-around gap-2 py-4">
      <div className="flex flex-col items-center gap-1.5">
        <span className="section-label">Progress</span>
        <Ring value={progress} />
      </div>
      <Divider />
      <div className="flex flex-col items-center gap-1.5">
        <span className="section-label">Rating</span>
        <span className="flex items-center gap-1 text-2xl font-bold" style={{ color: "var(--accent)" }}>
          <Star size={18} className="fill-current" />
          <CountUp value={rating} decimals={1} />
          <span className="text-sm font-normal text-gray-400">/5</span>
        </span>
      </div>
      <Divider />
      <div className="flex flex-col items-center gap-1.5">
        <span className="section-label">Streak</span>
        <span className="flex items-center gap-1 text-2xl font-bold">
          <Flame size={18} className="text-orange-500" />
          <CountUp value={streak} />
          <span className="text-sm font-normal text-gray-400">
            {streak === 1 ? "day" : "days"}
          </span>
        </span>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-10 w-px" style={{ background: "rgba(0,0,0,0.08)" }} />;
}

function Ring({ value }: { value: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="relative h-14 w-14">
      <svg className="h-14 w-14 -rotate-90" viewBox="0 0 48 48">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c9a86a" />
            <stop offset="100%" stopColor="#a97f45" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" stroke="rgba(0,0,0,0.07)" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          stroke="url(#ringGrad)"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
        {Math.round(value)}%
      </span>
    </div>
  );
}
