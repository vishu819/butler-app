import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatStream, type ChatMessage } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";
import { pickFocusSkills, parseSession, salvageQuestions, SYS, levelRubric } from "@/lib/session-gen";
import { LEVEL_NAME } from "@/lib/skills";
import { roleFor, skillKeysForRole } from "@/lib/roles";

export const runtime = "nodejs";
export const maxDuration = 120; // web-grounded generation can exceed 60s

const PER_SKILL = 1;
const TARGET = 4;

// SSE helpers
function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Strip correct/explanation from questions sent to the client (anti-peek).
function stripQuestion(q: any): any {
  return {
    skill: q.skill,
    level: q.level,
    concept: q.concept,
    question: q.question,
    options: q.options,
    followup_prompt: q.followup_prompt,
    followup_mcqs: Array.isArray(q.followup_mcqs)
      ? q.followup_mcqs.map((m: any) => ({ q: m.q, options: m.options }))
      : [],
  };
}

// GET -> stream-generated today's session as SSE events.
// Generates questions using chatStream(), sends each as it's parsed from the
// streaming JSON, then saves the full session to the DB.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);

  // Idempotent: don't re-generate if a session already exists for today.
  const { data: existing } = await supabase
    .from("sessions")
    .select("id")
    .eq("user_id", user.id)
    .eq("session_date", today)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ status: "exists" });
  }

  // Target role decides which skills this learner trains + how deep they go.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("target_role")
    .eq("id", user.id)
    .maybeSingle();
  const role = roleFor(profileRow?.target_role);
  const roleSkillKeys = skillKeysForRole(profileRow?.target_role);

  const { data: allSkillRows } = await supabase
    .from("skill_profile")
    .select("skill, level, proficiency, seen")
    .eq("user_id", user.id);
  const skillRows = (allSkillRows || []).filter((r) => roleSkillKeys.includes(r.skill));

  const { data: recentSessions } = await supabase
    .from("sessions")
    .select("focus_skills")
    .eq("user_id", user.id)
    .order("session_date", { ascending: false })
    .limit(3);
  const recentlyCovered = (recentSessions || []).flatMap((s) => s.focus_skills || []);

  // Curriculum: active path topics + the next new concept.
  const { data: topics } = await supabase
    .from("curriculum")
    .select("topic, skill, status, rationale, position")
    .eq("user_id", user.id)
    .neq("status", "mastered")
    .order("position")
    .limit(8);
  const active = (topics || []).filter((t) => t.status === "active");
  const firstPlanned = (topics || []).find((t) => t.status === "planned");
  const pathTopics = active.slice(0, 3).map((t) => ({
    topic: t.topic,
    skill: t.skill as string,
    rationale: (t.rationale as string) || "",
  }));
  const newTopic = firstPlanned
    ? { topic: firstPlanned.topic, skill: firstPlanned.skill }
    : null;

  const focusCount = newTopic ? TARGET - 1 : TARGET;
  const focus = pickFocusSkills(skillRows, focusCount, recentlyCovered, roleSkillKeys).map(
    (f) => ({ ...f, level: Math.min(f.level, role.ceiling) })
  );

  // Build the LLM prompt (same structure as generateSession() in session-gen.ts).
  const spec = focus
    .map(
      (f) =>
        `- ${PER_SKILL} REINFORCEMENT questions on "${f.key}" (${f.label}) at level ${f.level}/5 (${LEVEL_NAME[f.level]}).\n  ${levelRubric(f.level)}`
    )
    .join("\n");

  const pathSpec = pathTopics.length
    ? `\nThese are the learner's ACTIVE path topics — frame reinforcement questions around them wherever the skill matches, so the session moves their plan forward:\n${pathTopics
        .map((p) => `- "${p.topic}" (skill "${p.skill}")${p.rationale ? ` — ${p.rationale}` : ""}`)
        .join("\n")}`
    : "";

  const newSpec = newTopic
    ? `\n- 1 question introducing a NEW concept the learner hasn't studied: "${newTopic.topic}" (skill "${newTopic.skill}") at level 1-2 (approachable first exposure — teach, don't trick).`
    : "";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: role.framing
        ? `${SYS}\n\nTARGET ROLE CONTEXT: ${role.framing}`
        : SYS,
    },
    {
      role: "user",
      content: `Generate a focused daily session of EXACTLY ${focus.length * PER_SKILL + (newTopic ? 1 : 0)} questions. The learner should LEARN SOMETHING NEW today AND reinforce a weak area:
${spec}${pathSpec}${newSpec}
Produce ALL of the questions listed above — do not omit any.
USE WEB SEARCH to ground questions in REAL, current material: recent postmortems, well-known outages, up-to-date best practices, and real system designs for these topics. Base scenarios on things that actually happened (name the company/system/incident where you can) rather than invented examples.

CALIBRATE each question to ITS stated level using the rubric above — do not write a level-5 tradeoff for a level-1 skill or vice versa. The learner rises one step at a time.

For each question provide: (a) a multiple-choice question, (b) a follow-up OPEN question the learner types a short answer to (push them to explain the reasoning, at a depth appropriate to the level), and (c) exactly 3 deeper follow-up MULTIPLE-CHOICE questions on the SAME concept at the SAME level, drilling progressively into it (each stands alone, graded automatically). For the NEW concept, the explanation should genuinely teach it.

Return ONLY a JSON object (no prose, no citations outside the JSON):
{"questions":[{"skill":"the skill key","level":<the level number>,"concept":"short tag e.g. 'write-heavy sharding'","question":"specific MCQ","options":["A","B","C","D"],"correct":0,"explanation":"3-5 sentences teaching the principle","followup_prompt":"an open question probing WHY / the tradeoff, answerable in 2-3 sentences","followup_mcqs":[{"q":"a deeper MCQ on the same concept","options":["A","B","C","D"],"correct":0,"explanation":"1-2 sentences on why"}]}]}
Exactly 4 options for every MCQ (main and follow-ups), vary the correct index. Exactly 3 items in followup_mcqs. Match each question's concreteness to its level (higher levels get real numbers and named incidents; lower levels stay clean and focused).`,
    },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Let the client know generation has started.
        controller.enqueue(encoder.encode(sse("status", "generating")));

        let buffer = "";
        let lastQuestionCount = 0;
        let lastCheckLen = 0;
        const allQuestions: any[] = [];

        // Stream the LLM output, extracting complete questions as they arrive.
        for await (const chunk of chatStream(messages, {
          model: modelFor("generate"),
          online: true,
          json: true,
          temperature: 0.8,
          maxTokens: 16000,
          timeoutMs: 75000,
        })) {
          buffer += chunk;

          // Only check for new questions when the buffer has grown by ~100 chars
          // to avoid excessive JSON.parse() calls on every tiny chunk.
          if (buffer.length - lastCheckLen < 100) continue;
          lastCheckLen = buffer.length;

          const parsed = salvageQuestions(buffer);
          if (parsed && parsed.questions.length > lastQuestionCount) {
            for (let i = lastQuestionCount; i < parsed.questions.length; i++) {
              const q = parsed.questions[i];
              // Validate basic structure before sending to the client.
              if (q && q.skill && q.question && Array.isArray(q.options) && q.options.length === 4) {
                allQuestions.push(q);
                controller.enqueue(encoder.encode(sse("question", stripQuestion(q))));
              }
            }
            lastQuestionCount = parsed.questions.length;
          }
        }

        // Final parse of the complete JSON for validation.
        const questions = parseSession(buffer);
        if (questions.length === 0) {
          controller.enqueue(
            encoder.encode(sse("error", { message: "Couldn't build a session. Try again." }))
          );
          controller.close();
          return;
        }

        // Save the full session to the DB.
        if (newTopic) {
          await supabase
            .from("curriculum")
            .update({ status: "active" })
            .eq("user_id", user.id)
            .eq("topic", newTopic.topic)
            .eq("status", "planned");
        }
        const focusKeys = [
          ...new Set([...focus.map((f) => f.key), ...(newTopic ? [newTopic.skill] : [])]),
        ];
        const { error } = await supabase.from("sessions").insert({
          user_id: user.id,
          session_date: today,
          focus_skills: focusKeys,
          questions,
          responses: [],
          status: "active",
        });

        if (error) {
          controller.enqueue(encoder.encode(sse("error", { message: error.message })));
        } else {
          controller.enqueue(encoder.encode(sse("done", { count: questions.length })));
        }
      } catch (e: any) {
        controller.enqueue(
          encoder.encode(sse("error", { message: e.message || "Generation failed" }))
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}