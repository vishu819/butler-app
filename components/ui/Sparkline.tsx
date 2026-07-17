"use client";

// A tiny dependency-free SVG sparkline. Plots a series of 0-100 values as a
// smooth-ish polyline scaled to the box. Used in Progress to show a skill's
// understanding trend over its recent sessions.
export default function Sparkline({
  data,
  width = 64,
  height = 20,
  color = "var(--accent-bright)",
  strokeWidth = 1.5,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}) {
  if (!data || data.length < 2) return null;

  const pad = strokeWidth; // keep the stroke inside the box
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1; // avoid /0 on a flat line
  const stepX = (width - pad * 2) / (data.length - 1);

  const pts = data.map((v, i) => {
    const x = pad + i * stepX;
    // invert Y: higher value = higher on screen
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = pts[pts.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={strokeWidth * 1.3} fill={color} />
    </svg>
  );
}
