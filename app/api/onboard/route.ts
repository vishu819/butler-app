import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chat } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";
import { roleFor, skillKeysForRole } from "@/lib/roles";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST { name?, role?, experience?, goal?, strong?, weak? }
// -> saves the intake to profiles (name, target_role, experience, onboarded),
// seeds the role's skill rows, and drafts a role-calibrated learner_profile so
// day 1 is targeted. The client then calls /api/plan to build the curriculum.
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

  const role = roleFor(body?.role);
  const experience: string = typeof body?.experience === "string" ? body.experience.trim() : "";
  const goal: string = typeof body?.goal === "string" ? body.goal.trim() : "";
  const name: string = typeof body?.name === "string" ? body.name.trim() : "";

  // 1) Persist the intake to profiles + flip onboarded on.
  const profilePatch: Record<string, unknown> = {
    target_role: role.key,
    experience: experience || null,
    onboarded: true,
  };
  if (name) profilePatch.name = name;
  await supabase.from("profiles").update(profilePatch).eq("id", user.id);

  // 2) Seed a skill_profile row for each skill this role trains (level 1 start),
  // so the plan + first session have the role's skill set to work with.
  const skillKeys = skillKeysForRole(role.key);
  const seedRows = skillKeys.map((skill) => ({
    user_id: user.id,
    skill,
    level: 1,
    proficiency: 0,
    seen: 0,
    correct: 0,
    sessions_at_level: 0,
    history: [],
  }));
  // Don't clobber any existing rows (e.g. a returning user) — ignore conflicts.
  await supabase.from("skill_profile").upsert(seedRows, {
    onConflict: "user_id,skill",
    ignoreDuplicates: true,
  });

  // 3) Draft a starting learner_profile calibrated to the role + intake.
  const provided = experience || goal || body?.strong || body?.weak;
  if (!provided) {
    await supabase.from("learner_profile").upsert(
      {
        user_id: user.id,
        narrative: `New ${role.label.toLowerCase()} learner — Butler is still assessing. Complete a few sessions and this fills in.`,
        strengths: [],
        gaps: [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    return NextResponse.json({ ok: true, seeded: false, role: role.key });
  }

  try {
    const raw = await chat(
      [
        {
          role: "system",
          content: `You create a starting learner profile for someone using a mentoring app to grow toward a specific role. ${role.framing} Be concise and honest — this is a first estimate that sessions will refine. Return JSON only.`,
        },
        {
          role: "user",
          content: `Target role: ${role.label}
Experience: ${experience || "(not given)"}
What they told us they want: ${goal || "(not given)"}
Feels strong in: ${body?.strong || "(not given)"}
Wants to improve: ${body?.weak || "(not given)"}

Return JSON:
{"narrative":"2-3 sentence starting portrait of this learner and their goal, in the context of the target role","strengths":["from what they said / their experience"],"gaps":["what to focus on early for this role"]}`,
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
    return NextResponse.json({ ok: true, seeded: true, role: role.key, narrative: p.narrative });
  } catch (e: any) {
    // Even if the LLM draft fails, onboarding succeeded (profile flags are set).
    await supabase.from("learner_profile").upsert(
      {
        user_id: user.id,
        narrative: `New ${role.label.toLowerCase()} learner — Butler is still assessing.`,
        strengths: [],
        gaps: [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    return NextResponse.json({ ok: true, seeded: false, role: role.key, warn: e?.message });
  }
}
