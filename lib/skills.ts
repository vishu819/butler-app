// The fixed architect competency map. Every quiz question is tagged with one of
// these `skill` keys so Butler can track proficiency and target weaknesses.
export const SKILLS: { key: string; label: string }[] = [
  { key: "distributed_systems", label: "Distributed Systems" },
  { key: "data_modeling", label: "Databases & Data Modeling" },
  { key: "api_design", label: "API & Interface Design" },
  { key: "caching", label: "Caching & Performance" },
  { key: "concurrency", label: "Concurrency & Consistency" },
  { key: "messaging", label: "Messaging & Event-Driven" },
  { key: "scalability", label: "Scalability & Load" },
  { key: "reliability", label: "Reliability & Resilience" },
  { key: "security", label: "Security" },
  { key: "observability", label: "Observability & Ops" },
  { key: "networking", label: "Networking & Protocols" },
  { key: "system_design", label: "System Design & Tradeoffs" },
];

export const SKILL_KEYS = SKILLS.map((s) => s.key);
export const SKILL_LABEL = Object.fromEntries(SKILLS.map((s) => [s.key, s.label]));

export const LEVEL_NAME: Record<number, string> = {
  1: "Foundational",
  2: "Applied",
  3: "Intermediate",
  4: "Advanced",
  5: "Expert / staff-level",
};
