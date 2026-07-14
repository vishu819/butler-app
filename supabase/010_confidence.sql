-- v3.2: cumulative, confidence-gated progression.
-- Track how many sessions the learner has done AT the current level, and a
-- rolling per-skill history the LLM reasons over to judge readiness on the trend.
alter table skill_profile add column if not exists sessions_at_level int not null default 0;
alter table skill_profile add column if not exists history jsonb not null default '[]'::jsonb;
-- history: [{date, level, understanding, verdict, note}] most-recent last, capped ~12.
