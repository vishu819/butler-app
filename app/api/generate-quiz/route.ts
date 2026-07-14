import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSkillState, generateQuiz, QUIZ_TITLE } from "@/lib/quiz-gen";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST -> generates today's quiz on demand for the logged-in user (if missing).
// Session-authenticated, so no CRON_SECRET needed. Idempotent for the day.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const admin = createAdminClient();

  // ?force=1 regenerates a fresh quiz even if one exists.
  const force = new URL(req.url).searchParams.get("force") === "1";

  if (!force) {
    const { data: existing } = await admin
      .from("daily_content")
      .select("payload")
      .eq("content_date", today)
      .eq("type", "eng_q")
      .maybeSingle();
    if (existing) return NextResponse.json({ status: "exists", quiz: existing.payload });
  }

  // Skill profile drives difficulty + weakness targeting.
  const { data: profileRows } = await supabase
    .from("skill_profile")
    .select("skill, level, proficiency, seen")
    .eq("user_id", user.id);
  const skillState = buildSkillState(profileRows || []);

  // Avoid repeating recently-asked questions.
  const { data: recentQuizzes } = await admin
    .from("daily_content")
    .select("payload")
    .eq("type", "eng_q")
    .order("content_date", { ascending: false })
    .limit(7);
  const askedQuestions = (recentQuizzes || [])
    .flatMap((r) => (r.payload as any)?.questions || [])
    .map((q: any) => q?.question)
    .filter(Boolean)
    .slice(0, 40);

  try {
    const questions = await generateQuiz(skillState, askedQuestions);
    if (questions.length === 0) {
      return NextResponse.json(
        { error: "The model didn't return valid questions. Please try again." },
        { status: 502 }
      );
    }

    const payload = { title: QUIZ_TITLE, questions };
    const { error } = await admin
      .from("daily_content")
      .upsert(
        { content_date: today, type: "eng_q", payload },
        { onConflict: "content_date,type" }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // On a forced regenerate, clear today's result so the new quiz starts fresh.
    if (force) {
      await supabase
        .from("quiz_results")
        .delete()
        .eq("user_id", user.id)
        .eq("quiz_date", today);
    }
    return NextResponse.json({ status: "generated", quiz: payload });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "generation failed" }, { status: 502 });
  }
}
