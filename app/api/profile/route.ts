import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SKILLS } from "@/lib/skills";

export const runtime = "nodejs";

// GET -> the user's full skill map (every skill, with defaults for untested ones).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("skill_profile")
    .select("skill, level, proficiency, seen, correct")
    .eq("user_id", user.id);
  const rows = new Map((data || []).map((r) => [r.skill, r]));

  const skills = SKILLS.map((s) => {
    const r = rows.get(s.key);
    return {
      key: s.key,
      label: s.label,
      level: r?.level ?? 1,
      proficiency: r?.proficiency ?? 0,
      seen: r?.seen ?? 0,
      correct: r?.correct ?? 0,
    };
  });

  return NextResponse.json({ skills });
}
