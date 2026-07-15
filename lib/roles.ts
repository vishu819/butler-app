// Role families. A learner's target role decides WHICH skills they train, how
// high they can climb (level ceiling), and how questions/plan are framed. Not
// everyone is aiming to be an architect — Butler adapts to the goal.
import { ALL_SKILL_KEYS } from "@/lib/skills";

export type RoleKey =
  | "architect"
  | "backend"
  | "frontend"
  | "data"
  | "em"
  | "generalist";

export type Role = {
  key: RoleKey;
  label: string;
  blurb: string; // shown in the onboarding picker
  // The skill keys this role trains (subset of ALL_SKILL_KEYS).
  skills: string[];
  // How deep the path goes. e.g. architect = 5 (staff), a focused IC role = 4.
  ceiling: number;
  // Injected into generation/plan system prompts so framing fits the goal.
  framing: string;
};

export const ROLES: Role[] = [
  {
    key: "architect",
    label: "Software Architect",
    blurb: "Distributed systems, tradeoffs, large-scale design.",
    skills: [
      "distributed_systems",
      "data_modeling",
      "api_design",
      "caching",
      "concurrency",
      "messaging",
      "scalability",
      "reliability",
      "security",
      "observability",
      "networking",
      "system_design",
    ],
    ceiling: 5,
    framing:
      "The learner is training to become a software ARCHITECT: deep distributed-systems judgment, large-scale tradeoffs, and failure-mode reasoning. Push toward staff/architect depth.",
  },
  {
    key: "backend",
    label: "Backend Engineer",
    blurb: "APIs, data, concurrency, reliability at service scale.",
    skills: [
      "api_design",
      "data_modeling",
      "caching",
      "concurrency",
      "messaging",
      "reliability",
      "security",
      "observability",
      "scalability",
    ],
    ceiling: 4,
    framing:
      "The learner is training to become a strong BACKEND engineer: robust services, sound data modeling, correct concurrency, and production reliability. Emphasize service-level design over org-wide architecture.",
  },
  {
    key: "frontend",
    label: "Frontend Engineer",
    blurb: "Rendering, state, performance, accessibility.",
    skills: [
      "fe_rendering",
      "fe_state",
      "fe_performance",
      "fe_accessibility",
      "fe_architecture",
      "fe_testing",
      "api_design",
    ],
    ceiling: 4,
    framing:
      "The learner is training to become a strong FRONTEND engineer: browser rendering & the critical path, state management, performance budgets, accessibility, and maintainable UI architecture. Ground questions in real browser/framework behavior, NOT backend distributed systems.",
  },
  {
    key: "data",
    label: "Data Engineer",
    blurb: "Pipelines, storage, streaming, warehousing.",
    skills: [
      "de_pipelines",
      "de_storage",
      "de_streaming",
      "de_warehousing",
      "de_quality",
      "de_orchestration",
      "data_modeling",
    ],
    ceiling: 4,
    framing:
      "The learner is training to become a strong DATA engineer: reliable pipelines, storage & file-format tradeoffs, batch vs streaming, dimensional modeling & warehousing, data quality and orchestration. Ground questions in real data-platform tooling and failure modes.",
  },
  {
    key: "em",
    label: "Engineering Manager",
    blurb: "Delivery, people, technical judgment, strategy.",
    skills: [
      "em_delivery",
      "em_people",
      "em_technical",
      "em_process",
      "em_strategy",
      "system_design",
    ],
    ceiling: 4,
    framing:
      "The learner is training to become an effective ENGINEERING MANAGER: delivery & execution, growing people, sound technical judgment (enough to guide, not to code every line), process & communication, and prioritization/strategy. Frame questions as realistic leadership/decision scenarios, not low-level coding puzzles.",
  },
  {
    key: "generalist",
    label: "Software Engineer (Generalist)",
    blurb: "A balanced path across core engineering skills.",
    skills: [
      "api_design",
      "data_modeling",
      "caching",
      "concurrency",
      "reliability",
      "security",
      "observability",
      "system_design",
    ],
    ceiling: 4,
    framing:
      "The learner is a general software engineer leveling up broadly across core engineering skills. Keep questions practical and balanced across the set.",
  },
];

export const DEFAULT_ROLE: RoleKey = "architect";

export function roleFor(key?: string | null): Role {
  return ROLES.find((r) => r.key === key) || ROLES.find((r) => r.key === DEFAULT_ROLE)!;
}

// The skill keys a role trains, guaranteed to be valid registry keys.
export function skillKeysForRole(key?: string | null): string[] {
  const role = roleFor(key);
  const valid = role.skills.filter((s) => ALL_SKILL_KEYS.includes(s));
  return valid.length ? valid : ALL_SKILL_KEYS.slice(0, 12);
}
