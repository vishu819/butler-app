// The full competency registry across ALL roles. Each quiz question is tagged
// with one of these `skill` keys so Butler can track proficiency and target
// weaknesses. A given USER only trains the subset their target role defines
// (see lib/roles.ts) — this registry just guarantees every key resolves to a
// label no matter which role produced it.
export const ALL_SKILLS: { key: string; label: string }[] = [
  // --- Architecture / backend / distributed ---
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
  // --- Frontend ---
  { key: "fe_rendering", label: "Rendering & the Browser" },
  { key: "fe_state", label: "State Management" },
  { key: "fe_performance", label: "Frontend Performance" },
  { key: "fe_accessibility", label: "Accessibility" },
  { key: "fe_architecture", label: "Frontend Architecture" },
  { key: "fe_testing", label: "Testing & Tooling" },
  // --- Data engineering ---
  { key: "de_pipelines", label: "Data Pipelines & ETL" },
  { key: "de_storage", label: "Storage & File Formats" },
  { key: "de_streaming", label: "Streaming & Real-time" },
  { key: "de_warehousing", label: "Warehousing & Modeling" },
  { key: "de_quality", label: "Data Quality & Governance" },
  { key: "de_orchestration", label: "Orchestration & Scheduling" },
  // --- Engineering management ---
  { key: "em_delivery", label: "Delivery & Execution" },
  { key: "em_people", label: "People & Growth" },
  { key: "em_technical", label: "Technical Judgment" },
  { key: "em_process", label: "Process & Communication" },
  { key: "em_strategy", label: "Strategy & Prioritization" },
];

// Back-compat: the original 12 architecture skills. Kept as the default set so
// existing code paths and existing users (defaulting to the architect role)
// behave exactly as before.
export const SKILLS = ALL_SKILLS.slice(0, 12);

export const SKILL_KEYS = SKILLS.map((s) => s.key);
export const ALL_SKILL_KEYS = ALL_SKILLS.map((s) => s.key);
export const SKILL_LABEL = Object.fromEntries(ALL_SKILLS.map((s) => [s.key, s.label]));

export const LEVEL_NAME: Record<number, string> = {
  1: "Foundational",
  2: "Applied",
  3: "Intermediate",
  4: "Advanced",
  5: "Expert / staff-level",
};
