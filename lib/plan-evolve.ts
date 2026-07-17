// Auto-evolving curriculum. After each session the LLM judge calls evolvePlan()
// to reshape the learner's path IN PLACE — without wiping their progress.
//
// This is the difference between a static syllabus and a mentor: the plan is
// re-examined against the learner's freshly-updated profile and can:
//   - drop planned topics that no longer fit (already mastered elsewhere, or a gap closed),
//   - add new topics that the latest gaps/misconceptions expose,
//   - re-order what's still `planned` so the most relevant next step comes first.
//
// Crucially it NEVER touches `active` or `mastered` rows' identity or mastery —
// those are earned history. It only prunes/re-orders the `planned` tail and
// appends new topics. Full destructive regeneration still lives in POST /api/plan
// for an explicit "start over".
import type { SupabaseClient } from "@supabase/supabase-js";
import { chat } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";
import { SKILL_LABEL } from "@/lib/skills";
import { roleFor, skillKeysForRole } from "@/lib/roles";

type PlanRow = {
  id: string;
  module: string;
  topic: string;
  skill: string | null;
  rationale: string | null;
  position: number;
  status: string;
  mastery: number;
};

type EvolveResult =
  | { status: "evolved"; added: number; dropped: number; reordered: boolean }
  | { status: "skipped"; reason: string }
  | { status: "error"; reason: string };

type HistEntry = { date?: string; level?: number; understanding?: number; verdict?: string };

// Collapse a skill's session history (capped at 12 entries) into ONE compact
// line the path-builder can reason over: where it started, where it is, and
// which way it's moving. This is deliberately bounded — one line per skill,
// never the raw per-session transcripts — so the prompt does not grow with how
// long the learner has used the app.
function trendLine(history: HistEntry[] | null | undefined): string {
  const h = (history || []).filter((x) => typeof x?.understanding === "number");
  if (h.length === 0) return "";
  const first = h[0];
  const last = h[h.length - 1];
  const u0 = first.understanding ?? 0;
  const u1 = last.understanding ?? 0;
  const lvl0 = first.level ?? 1;
  const lvl1 = last.level ?? lvl0;

  // Direction from the slope of the last few points (steady if it barely moved).
  const tail = h.slice(-3);
  const slope = (tail[tail.length - 1].understanding ?? 0) - (tail[0].understanding ?? 0);
  const dir = slope > 8 ? "rising" : slope < -8 ? "dipping" : "steady";

  const lvlPart = lvl1 !== lvl0 ? `L${lvl0}→L${lvl1}` : `L${lvl1}`;
  return `${lvlPart}, understanding ${u0}→${u1} (${dir}) over ${h.length} session${h.length === 1 ? "" : "s"}`;
}

// A cheap client-side guard so we don't spam the LLM: only re-plan when the tail
// of planned topics is short (learner is catching up) OR the profile clearly
// changed. The judge decides WHEN to call this; here we just do the work.
export async function evolvePlan(
  supabase: SupabaseClient,
  userId: string,
  profile: { narrative?: string | null; strengths?: string[]; gaps?: string[]; misconceptions?: { topic: string; note: string }[] }
): Promise<EvolveResult> {
  // Current plan + skill levels + target role.
  const [{ data: planData }, { data: skillData }, { data: profileRow }] = await Promise.all([
    supabase
      .from("curriculum")
      .select("id, module, topic, skill, rationale, position, status, mastery")
      .eq("user_id", userId)
      .order("position"),
    supabase.from("skill_profile").select("skill, level, proficiency, history").eq("user_id", userId),
    supabase.from("profiles").select("target_role").eq("id", userId).maybeSingle(),
  ]);

  const plan = (planData || []) as PlanRow[];
  if (plan.length === 0) return { status: "skipped", reason: "no plan yet" };

  const role = roleFor(profileRow?.target_role);
  const roleSkillKeys = skillKeysForRole(profileRow?.target_role);

  const locked = plan.filter((p) => p.status === "active" || p.status === "mastered");
  const pending = plan.filter((p) => p.status === "planned");

  const skillLevels = roleSkillKeys
    .map((k) => {
      const r = (skillData || []).find((x) => x.skill === k);
      if (!r) return `- ${SKILL_LABEL[k] || k}: not assessed`;
      const trend = trendLine(r.history as HistEntry[]);
      const base = `lvl ${r.level}, ${r.proficiency}/100`;
      return `- ${SKILL_LABEL[k] || k}: ${base}${trend ? ` — trend: ${trend}` : ""}`;
    })
    .join("\n");

  const lockedList = locked.length
    ? locked.map((p) => `#${p.id} "${p.topic}" [${p.status}${p.status === "mastered" ? ` ${p.mastery}%` : ""}]`).join("\n")
    : "(none yet)";
  const pendingList = pending.length
    ? pending.map((p) => `#${p.id} "${p.topic}" (${p.skill || "?"})`).join("\n")
    : "(none — the learner has consumed the whole planned tail)";

  let decision: {
    keep_ids?: string[];
    add?: { topic: string; skill: string; rationale: string; module?: string }[];
    order?: string[]; // ids of the pending topics we keep, in new order (kept ones first, then added at the end)
  };
  try {
    const raw = await chat(
      [
        {
          role: "system",
          content: `You are Butler, a mentor maintaining a learner's living curriculum. ${role.framing} Given their freshly-updated profile and what they've already mastered/started, you PRUNE and EXTEND only the not-yet-started ('planned') tail of their path. You must NEVER remove or re-topic anything active or mastered — that is earned history.

Read each skill's TREND (direction of understanding over recent sessions) as your primary signal alongside their gaps and misconceptions:
- A skill trending 'rising' toward mastery needs LESS reinforcement — don't pile on planned topics for it; let them advance.
- A skill trending 'dipping' or stuck 'steady' at low understanding needs MORE — add a topic that attacks the specific gap/misconception, ideally from a fresh angle.
- Misconceptions are the strongest 'teach this next' signal — a wrong mental model outranks a merely-missing topic.

Keep planned topics that still serve their current gaps; drop planned topics that are now redundant (a gap closed, or subsumed by something mastered); add 1-4 NEW planned topics their latest gaps/misconceptions/trends reveal they need next — always fitting the target role, never drifting into unrelated domains. Prefer the tradeoff-heavy, failure-mode topics people in this role get wrong. Be surgical, not sweeping — most sessions change little. Return JSON only.`,
        },
        {
          role: "user",
          content: `Learner's current skill levels (with recent trend where available):
${skillLevels}

Updated profile:
Narrative: ${profile.narrative || "(none)"}
Strengths: ${(profile.strengths || []).join(", ") || "(none)"}
Gaps: ${(profile.gaps || []).join(", ") || "(none)"}
Misconceptions: ${(profile.misconceptions || []).map((m) => `${m.topic}: ${m.note}`).join("; ") || "(none)"}

LOCKED (do not touch — active/mastered):
${lockedList}

PLANNED tail (you may keep, drop, reorder, and add to this):
${pendingList}

Decide how the planned tail should evolve to best serve where they are NOW. For each NEW topic, "skill" MUST be one of: ${roleSkillKeys.join(", ")}.

Return JSON:
{"keep_ids":["ids of planned topics to KEEP"],"add":[{"topic":"specific next topic","skill":"one_key","rationale":"why this, why now","module":"optional module name"}],"order":["kept ids in the new order they should appear"]}`,
        },
      ],
      { model: modelFor("generate"), json: true, temperature: 0.5, maxTokens: 1200, timeoutMs: 30000 }
    );
    decision = JSON.parse(raw);
  } catch (e: any) {
    return { status: "error", reason: e?.message || "evolve LLM failed" };
  }

  const pendingIds = new Set(pending.map((p) => p.id));
  const keepIds = (decision.keep_ids || []).filter((id) => pendingIds.has(id));
  const keepSet = new Set(keepIds);
  const dropped = pending.filter((p) => !keepSet.has(p.id));

  // Sanitize additions.
  const additions = (decision.add || [])
    .filter((a) => a?.topic && roleSkillKeys.includes(a.skill))
    .slice(0, 4);

  // Nothing to do? Bail without a write.
  if (dropped.length === 0 && additions.length === 0) {
    // Still allow a pure reorder if the model asked for one.
    const orderIds = (decision.order || []).filter((id) => keepSet.has(id));
    const reordered = orderIds.length === keepIds.length && orderIds.some((id, i) => keepIds[i] !== id);
    if (!reordered) return { status: "skipped", reason: "no change" };
  }

  // Build the new ordered planned tail: kept (in requested order) then additions.
  const orderIds = (decision.order || []).filter((id) => keepSet.has(id));
  const orderedKeep = orderIds.length
    ? [...orderIds, ...keepIds.filter((id) => !orderIds.includes(id))]
    : keepIds;

  // Positions: locked rows keep their positions; planned tail is re-numbered
  // starting after the highest locked position.
  const maxLockedPos = locked.reduce((m, p) => Math.max(m, p.position), -1);
  let pos = maxLockedPos + 1;

  // 1) Drop the pruned planned rows.
  if (dropped.length) {
    await supabase
      .from("curriculum")
      .delete()
      .eq("user_id", userId)
      .in("id", dropped.map((d) => d.id));
  }

  // 2) Re-position kept planned rows.
  const keptById = new Map(pending.map((p) => [p.id, p]));
  for (const id of orderedKeep) {
    await supabase
      .from("curriculum")
      .update({ position: pos++, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);
  }

  // 3) Insert new planned topics at the end of the tail.
  if (additions.length) {
    const rows = additions.map((a) => ({
      user_id: userId,
      module: a.module || "Adaptive",
      topic: a.topic,
      skill: a.skill,
      rationale: a.rationale || null,
      position: pos++,
      status: "planned",
      mastery: 0,
    }));
    await supabase.from("curriculum").insert(rows);
  }

  const reordered =
    orderIds.length === keepIds.length && orderIds.some((id, i) => keepIds[i] !== id);
  void keptById;
  return { status: "evolved", added: additions.length, dropped: dropped.length, reordered };
}
