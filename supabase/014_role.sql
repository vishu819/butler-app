-- 014: role-aware onboarding. A learner picks a TARGET ROLE (architect, backend,
-- frontend, data, em, generalist) on first login; the path/skills/level ceiling
-- adapt to it. Existing users get target_role NULL → treated as 'architect', and
-- onboarded=false → they'll see the intro wizard once (their progress is kept).
alter table profiles add column if not exists target_role text;
alter table profiles add column if not exists experience text;
alter table profiles add column if not exists onboarded boolean not null default false;

-- Existing users who already have real learning data shouldn't be forced through
-- onboarding as if brand-new. Mark anyone with a curriculum as already onboarded.
update profiles p
set onboarded = true
where exists (select 1 from curriculum c where c.user_id = p.id);
