"use client";

type Skill = { key: string; label: string; proficiency: number };

// Wide viewBox with horizontal padding so labels never clip. The web is
// centered; extra width on the sides holds the left/right skill labels.
const VW = 440; // viewBox width (extra room for side labels)
const VH = 320; // viewBox height
const CX = VW / 2;
const CY = VH / 2;
const RADIUS = 88; // outer edge (100 proficiency) — kept small so labels fit
const RINGS = [25, 50, 75, 100];

function clamp(n: number) {
  return Math.min(100, Math.max(0, n));
}

function truncate(label: string, max = 12) {
  return label.length > max ? label.slice(0, max - 1) + "…" : label;
}

// angle for axis i (starting at top, -90deg, going clockwise)
function angleFor(i: number, count: number) {
  return (-90 + (360 / count) * i) * (Math.PI / 180);
}

function pointFor(i: number, count: number, value: number) {
  const a = angleFor(i, count);
  const r = (clamp(value) / 100) * RADIUS;
  return {
    x: CX + r * Math.cos(a),
    y: CY + r * Math.sin(a),
  };
}

export default function SkillRadar({ skills }: { skills: Skill[] }) {
  // A radar needs at least 3 axes with real values to look right.
  const active = skills.filter((s) => clamp(s.proficiency) > 0);
  if (active.length < 3) return null;

  const count = active.length;

  // Data polygon points.
  const dataPoints = active.map((s, i) => pointFor(i, count, s.proficiency));
  const dataPath = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%"
      height="auto"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Skill proficiency radar chart"
    >
      <title>Skill proficiency radar chart</title>

      {/* Concentric gridline polygons (the "web") */}
      {RINGS.map((ring) => {
        const pts = active
          .map((_, i) => {
            const p = pointFor(i, count, ring);
            return `${p.x},${p.y}`;
          })
          .join(" ");
        return (
          <polygon
            key={`ring-${ring}`}
            points={pts}
            fill="none"
            stroke="rgba(0,0,0,0.08)"
            strokeWidth="1"
          />
        );
      })}

      {/* Axis spokes */}
      {active.map((s, i) => {
        const edge = pointFor(i, count, 100);
        return (
          <line
            key={`axis-${s.key}`}
            x1={CX}
            y1={CY}
            x2={edge.x}
            y2={edge.y}
            stroke="rgba(0,0,0,0.08)"
            strokeWidth="1"
          />
        );
      })}

      {/* Data polygon */}
      <polygon
        points={dataPath}
        fill="var(--accent)"
        fillOpacity="0.18"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Vertex dots */}
      {dataPoints.map((p, i) => (
        <circle
          key={`dot-${active[i].key}`}
          cx={p.x}
          cy={p.y}
          r="3"
          fill="var(--accent)"
        />
      ))}

      {/* Labels around the outside */}
      {active.map((s, i) => {
        const a = angleFor(i, count);
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const labelR = RADIUS + 16;
        const lx = CX + labelR * cos;
        const ly = CY + labelR * sin;

        // Anchor based on horizontal position of the axis.
        let anchor: "start" | "middle" | "end" = "middle";
        if (cos > 0.2) anchor = "start";
        else if (cos < -0.2) anchor = "end";

        // Nudge vertical alignment so top/bottom labels sit clear of the web.
        const dy = sin < -0.6 ? "-0.1em" : sin > 0.6 ? "0.8em" : "0.32em";

        return (
          <text
            key={`label-${s.key}`}
            x={lx}
            y={ly}
            dy={dy}
            textAnchor={anchor}
            fontSize="11"
            fill="var(--muted)"
          >
            {truncate(s.label)}
          </text>
        );
      })}
    </svg>
  );
}
