import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Which targets can be reset, and the tables each clears (user-scoped via RLS).
const TARGETS: Record<string, string[]> = {
  // Skill/learning progress: skill profile, quiz history, sessions, the LLM
  // learner model, and the curriculum plan.
  skills: ["skill_profile", "quiz_results", "sessions", "learner_profile", "curriculum"],
  quizzes: ["quiz_results", "sessions"],
  chat: ["chat_messages"],
  memory: ["memory"],
  goals: ["goal_logs", "goals"],
  brain_gym: ["brain_gym_log"],
  library: ["learn_articles", "concept_diagrams", "daily_learning"],
  everything: [
    "skill_profile",
    "quiz_results",
    "sessions",
    "learner_profile",
    "curriculum",
    "chat_messages",
    "memory",
    "goal_logs",
    "goals",
    "brain_gym_log",
    "learn_articles",
    "concept_diagrams",
    "daily_learning",
  ],
};

// POST { target, confirm } -> deletes the user's rows for that target.
// `confirm` must equal "RESET" to guard against accidental calls.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { target, confirm } = body;
  const tables = TARGETS[target];
  if (!tables) return NextResponse.json({ error: "unknown target" }, { status: 400 });
  if (confirm !== "RESET") {
    return NextResponse.json({ error: "confirmation required" }, { status: 400 });
  }

  const cleared: string[] = [];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq("user_id", user.id);
    if (error) return NextResponse.json({ error: `${table}: ${error.message}` }, { status: 500 });
    cleared.push(table);
  }
  return NextResponse.json({ ok: true, cleared });
}
