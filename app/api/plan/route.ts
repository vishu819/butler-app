import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chat } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";
import { SKILL_LABEL } from "@/lib/skills";
import { evolvePlan } from "@/lib/plan-evolve";
import { roleFor, skillKeysForRole } from "@/lib/roles";

export const runtime = "nodejs";
export const maxDuration = 60;

// Tolerant parse: the model may wrap JSON in ```fences``` or add stray prose.
// Recover the JSON object either way.
function parsePlan(raw: string): { modules?: any[] } | null {
  if (!raw) return null;
  let txt = raw.trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) txt = fence[1].trim();
  try {
    return JSON.parse(txt);
  } catch {
    const obj = txt.match(/\{[\s\S]*\}/);
    if (obj) {
      try {
        return JSON.parse(obj[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// GET -> the learner's curriculum plan + profile.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [planRes, profRes] = await Promise.all([
    supabase
      .from("curriculum")
      .select("id, module, topic, skill, rationale, position, status, mastery")
      .eq("user_id", user.id)
      .order("position"),
    supabase
      .from("learner_profile")
      .select("narrative, strengths, gaps, misconceptions, updated_at")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return NextResponse.json({ plan: planRes.data || [], profile: profRes.data || null });
}

// POST -> refresh or rebuild the adaptive curriculum.
//   body {mode:"refresh"} (DEFAULT) — non-destructive: keep active/mastered
//     progress, re-plan only the not-yet-started tail against current skills
//     (delegates to evolvePlan). This is the manual counterpart to the automatic
//     post-session evolution.
//   body {mode:"rebuild"} — destructive: design a brand-new curriculum from
//     scratch and replace everything (progress reset). "Start over".
// With no plan yet, either mode builds from scratch.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let mode: "refresh" | "rebuild" = "refresh";
  try {
    const body = await req.json();
    if (body?.mode === "rebuild") mode = "rebuild";
  } catch {
    /* no body → default refresh */
  }

  // Does a plan already exist? Refresh only makes sense when it does.
  const { data: hasPlan } = await supabase
    .from("curriculum")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  // ---- Non-destructive refresh: evolve the planned tail in place ----
  if (mode === "refresh" && hasPlan && hasPlan.length > 0) {
    const { data: profile } = await supabase
      .from("learner_profile")
      .select("narrative, strengths, gaps, misconceptions")
      .eq("user_id", user.id)
      .maybeSingle();
    const result = await evolvePlan(supabase, user.id, {
      narrative: profile?.narrative,
      strengths: profile?.strengths || [],
      gaps: profile?.gaps || [],
      misconceptions: profile?.misconceptions || [],
    });
    if (result.status === "error") {
      return NextResponse.json({ error: result.reason || "refresh failed" }, { status: 502 });
    }
    return NextResponse.json({ status: "refreshed", result });
  }

  // ---- Rebuild from scratch (or first-ever build) ----
  // Gather context: role + skill profile + narrative + prior mastery.
  const [profileRes, skillRes, profRes, priorRes] = await Promise.all([
    supabase.from("profiles").select("target_role").eq("id", user.id).maybeSingle(),
    supabase.from("skill_profile").select("skill, level, proficiency, seen").eq("user_id", user.id),
    supabase.from("learner_profile").select("narrative, strengths, gaps").eq("user_id", user.id).maybeSingle(),
    supabase.from("curriculum").select("topic, status, mastery").eq("user_id", user.id),
  ]);

  const role = roleFor(profileRes.data?.target_role);
  const roleSkillKeys = skillKeysForRole(profileRes.data?.target_role);

  const skillLines = roleSkillKeys
    .map((k) => {
      const r = (skillRes.data || []).find((x) => x.skill === k);
      return `- ${SKILL_LABEL[k] || k}: ${r ? `${r.proficiency}/100, level ${r.level}, ${r.seen} seen` : "not assessed"}`;
    })
    .join("\n");
  const prof = profRes.data;
  const priorTopics = (priorRes.data || [])
    .map((p) => `${p.topic} (${p.status}, ${p.mastery}%)`)
    .join("; ");

  let plan: any[];
  try {
    const raw = await chat(
      [
        {
          role: "system",
          content: `You are Butler, a master engineering mentor designing a personalized learning curriculum. ${role.framing} You build an ORDERED plan of modules, each broken into specific topics, that takes the learner from where they are to strong mastery for THIS role (level ceiling ${role.ceiling}/5). Prioritize the learner's gaps and the tradeoff-heavy, failure-mode topics people in this role most often get wrong. Every topic must be SPECIFIC and practical, not generic, and must fit the target role — do not drift into unrelated domains. Return JSON only.`,
        },
        {
          role: "user",
          content: `Target role: ${role.label}.

Learner's skill assessment (only these role-relevant skills):
${skillLines}

${prof?.narrative ? `What we know about them: ${prof.narrative}\nStrengths: ${(prof.strengths || []).join(", ")}\nGaps: ${(prof.gaps || []).join(", ")}` : `No profile yet — assume a mid-level engineer aiming for: ${role.label}.`}

${priorTopics ? `Topics already in their plan (keep mastered ones, evolve the rest): ${priorTopics}` : ""}

Design a curriculum of 4-6 modules, each with 3-5 specific topics. Order topics so foundations come before advanced tradeoffs, but front-load their weakest skills.

For each topic, "skill" MUST be exactly one of these keys (copy verbatim, do not invent): ${roleSkillKeys.join(", ")}.

Return JSON:
{"modules":[{"module":"module name","topics":[{"topic":"specific topic","skill":"one_of_the_keys_above","rationale":"one line: why this, why now"}]}]}`,
        },
      ],
      { model: modelFor("generate"), json: true, temperature: 0.6, maxTokens: 2500, timeoutMs: 55000 }
    );
    const parsed = parsePlan(raw);
    if (!parsed) return NextResponse.json({ error: "Couldn't build a plan. Try again." }, { status: 502 });
    // Flatten modules -> ordered topic rows.
    let pos = 0;
    plan = [];
    for (const m of parsed.modules || []) {
      for (const t of m.topics || []) {
        if (!t?.topic) continue;
        plan.push({
          user_id: user.id,
          module: m.module || "Module",
          topic: t.topic,
          skill: roleSkillKeys.includes(t.skill) ? t.skill : null,
          rationale: t.rationale || null,
          position: pos++,
          status: "planned",
          mastery: 0,
        });
      }
    }
    if (plan.length === 0) throw new Error("empty plan");
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "plan generation failed" }, { status: 502 });
  }

  // Replace this user's plan (fresh generation). Scoped to user_id.
  await supabase.from("curriculum").delete().eq("user_id", user.id);
  const { error } = await supabase.from("curriculum").insert(plan);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mark the first topic active.
  if (plan.length) {
    await supabase
      .from("curriculum")
      .update({ status: "active" })
      .eq("user_id", user.id)
      .eq("position", 0);
  }

  return NextResponse.json({ status: "generated", count: plan.length });
}