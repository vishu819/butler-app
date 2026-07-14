// Model-agnostic config: map ROLES to models, each env-overridable.
// Swap any role's model in one place (or via env) — the whole app follows.
// Stays on OpenRouter so the `:online` web plugin keeps working.

export type ModelRole = "judge" | "generate" | "web" | "coach";

const DEFAULT = "google/gemini-2.5-flash";

// A sharper model for judging/grading pays off (accuracy matters most there).
// Falls back to the general default if the env var is unset.
const ROLE_MODELS: Record<ModelRole, string> = {
  judge: process.env.OPENROUTER_MODEL_JUDGE || process.env.OPENROUTER_MODEL || DEFAULT,
  generate: process.env.OPENROUTER_MODEL_GENERATE || process.env.OPENROUTER_MODEL || DEFAULT,
  web: process.env.OPENROUTER_MODEL_WEB || process.env.OPENROUTER_MODEL || DEFAULT,
  coach: process.env.OPENROUTER_MODEL_COACH || process.env.OPENROUTER_MODEL || DEFAULT,
};

export function modelFor(role: ModelRole): string {
  return ROLE_MODELS[role];
}
