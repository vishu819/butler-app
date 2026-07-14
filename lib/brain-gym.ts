// Brain-gym categories — rotated so every aspect of cognition gets trained
// over a cycle. Each has a suggested time budget (seconds) for the timed UI.
export const BRAIN_CATEGORIES: {
  key: string;
  label: string;
  seconds: number;
  desc: string;
}[] = [
  { key: "memory", label: "Memory", seconds: 90, desc: "recall & working memory" },
  { key: "logic", label: "Logic", seconds: 150, desc: "deduction & reasoning" },
  { key: "spatial", label: "Spatial Reasoning", seconds: 120, desc: "shapes & rotation" },
  { key: "pattern", label: "Pattern Recognition", seconds: 120, desc: "sequences & rules" },
  { key: "mental_math", label: "Mental Math", seconds: 90, desc: "fast arithmetic" },
  { key: "verbal", label: "Verbal", seconds: 120, desc: "language & analogies" },
  { key: "attention", label: "Attention", seconds: 90, desc: "focus & detail" },
];

export const CATEGORY_LABEL = Object.fromEntries(
  BRAIN_CATEGORIES.map((c) => [c.key, c.label])
);
export const CATEGORY_SECONDS = Object.fromEntries(
  BRAIN_CATEGORIES.map((c) => [c.key, c.seconds])
);

// Pick the next category to train: the one least-recently (or never) done.
// `recentKeys` is the list of category keys from most-recent to oldest.
export function nextCategory(recentKeys: string[]): string {
  for (const c of BRAIN_CATEGORIES) {
    if (!recentKeys.includes(c.key)) return c.key; // never done -> highest priority
  }
  // All done at least once: pick the one done longest ago.
  let best = BRAIN_CATEGORIES[0].key;
  let bestIdx = -1;
  for (const c of BRAIN_CATEGORIES) {
    const idx = recentKeys.indexOf(c.key); // smaller = more recent
    if (idx > bestIdx) {
      bestIdx = idx;
      best = c.key;
    }
  }
  return best;
}
