import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chat } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";
import { SKILLS, SKILL_KEYS } from "@/lib/skills";

export const runtime = "nodejs";
export const maxDuration = 60;

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

// POST -> (re)generate the adaptive curriculum from the learner profile + skills.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Gather context: skill profile + narrative + prior mastery.
  const [skillRes, profRes, priorRes] = await Promise.all([
    supabase.from("skill_profile").select("skill, level, proficiency, seen").eq("user_id", user.id),
    supabase.from("learner_profile").select("narrative, strengths, gaps").eq("user_id", user.id).maybeSingle(),
    supabase.from("curriculum").select("topic, status, mastery").eq("user_id", user.id),
  ]);

  const skillLines = SKILLS.map((s) => {
    const r = (skillRes.data || []).find((x) => x.skill === s.key);
    return `- ${s.label}: ${r ? `${r.proficiency}/100, level ${r.level}, ${r.seen} seen` : "not assessed"}`;
  }).join("\n");
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
          content:
            "You are Butler, a master software-architecture mentor designing a personalized learning curriculum. You build an ORDERED plan of modules, each broken into specific topics, that takes the learner from where they are to strong architect-level mastery. Prioritize the learner's gaps and the tradeoff-heavy topics engineers most often fail (distributed-systems tradeoffs, data modeling decisions, consistency, real-world scalability). Each topic must be SPECIFIC and practical, not generic. Return JSON only.",
        },
        {
          role: "user",
          content: `Learner's skill assessment:
${skillLines}

${prof?.narrative ? `What we know about them: ${prof.narrative}\nStrengths: ${(prof.strengths || []).join(", ")}\nGaps: ${(prof.gaps || []).join(", ")}` : "No profile yet — assume a mid-level engineer aiming to become an architect."}

${priorTopics ? `Topics already in their plan (keep mastered ones, evolve the rest): ${priorTopics}` : ""}

Design a curriculum of 4-6 modules, each with 3-5 specific topics. Order topics so foundations come before advanced tradeoffs, but front-load their weakest skills.

For each topic, "skill" MUST be exactly one of these keys (copy verbatim, do not invent): ${SKILL_KEYS.join(", ")}.

Return JSON:
{"modules":[{"module":"module name","topics":[{"topic":"specific topic","skill":"one_of_the_keys_above","rationale":"one line: why this, why now"}]}]}`,
        },
      ],
      { model: modelFor("generate"), json: true, temperature: 0.6, maxTokens: 2500, timeoutMs: 55000 }
    );
    const parsed = JSON.parse(raw);
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
          skill: SKILL_KEYS.includes(t.skill) ? t.skill : null,
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

  // Replace the plan (fresh generation). Keep it simple for single-user.
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
