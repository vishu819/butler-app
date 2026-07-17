-- Deep daily study article. The cron already writes a short `summary` recap to
-- daily_learning; this adds a rich, consolidated HTML article generated from
-- ALL of the previous day's activity (session questions incl. missed/skipped,
-- every "Learn this topic" article, and all concepts covered). Rendered
-- expandable in the Library as "the deep read you shouldn't miss".
alter table daily_learning add column if not exists article text;
