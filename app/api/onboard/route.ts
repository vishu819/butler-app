import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chat } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST { answers: {experience?, role?, goal?, strong?, weak?} }  (all optional)
// -> seeds a learner_profile from the intake so day 1 is calibrated. Then the
// client triggers /api/plan to build a curriculum. Skips gracefully if empty.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty ok */
  }
  const a = body?.answers || {};
  const provided = [a.experience, a.role, a.goal, a.strong, a.weak].some(
    (v) => typeof v === "string" && v.trim()
  );

  // No answers → baseline profile, nothing to infer.
  if (!provided) {
    await supabase.from("learner_profile").upsert(
      {
        user_id: user.id,
        narrative:
          "New learner — Butler is still assessing. Complete a few sessions and this fills in.",
        strengths: [],
        gaps: [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    return NextResponse.json({ ok: true, seeded: false });
  }

  // With answers → LLM drafts a starting profile.
  try {
    const raw = await chat(
      [
        {
          role: "system",
          content:
            "You create a starting learner profile for a software engineer using an architecture-tutoring app, from their intake answers. Be concise and honest — this is a first estimate that sessions will refine. Return JSON only.",
        },
        {
          role: "user",
          content: `Intake answers (any may be blank):
Experience: ${a.experience || "(not given)"}
Current role: ${a.role || "(not given)"}
Main goal: ${a.goal || "(not given)"}
Feels strong in: ${a.strong || "(not given)"}
Wants to improve: ${a.weak || "(not given)"}

Return JSON:
{"narrative":"2-3 sentence starting portrait of this learner and their goal","strengths":["from what they said they're strong in"],"gaps":["from what they want to improve"]}`,
        },
      ],
      { model: modelFor("judge"), json: true, temperature: 0.4, maxTokens: 400, timeoutMs: 30000 }
    );
    const p = JSON.parse(raw);
    await supabase.from("learner_profile").upsert(
      {
        user_id: user.id,
        narrative: p.narrative || null,
        strengths: (p.strengths || []).slice(0, 12),
        gaps: (p.gaps || []).slice(0, 12),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    return NextResponse.json({ ok: true, seeded: true, narrative: p.narrative });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "onboarding failed" }, { status: 502 });
  }
}
