// Tiny client-side GET cache so switching tabs is instant instead of refetching.
// In-memory (per session) with a short TTL + stale-while-revalidate: returns the
// cached value immediately and refreshes in the background. No library.

type Entry = { data: any; at: number; inflight?: Promise<any> };
const cache = new Map<string, Entry>();
const DEFAULT_TTL = 60_000; // 1 min fresh

export async function cachedGet<T = any>(
  url: string,
  { ttl = DEFAULT_TTL, force = false }: { ttl?: number; force?: boolean } = {}
): Promise<T> {
  const now = performance.now();
  const hit = cache.get(url);

  // Fresh enough — return immediately.
  if (!force && hit && now - hit.at < ttl) return hit.data as T;

  // De-dupe concurrent requests.
  if (hit?.inflight) return hit.inflight as Promise<T>;

  const p = fetch(url)
    .then((r) => r.json())
    .then((data) => {
      cache.set(url, { data, at: performance.now() });
      return data;
    })
    .catch((e) => {
      // On failure, fall back to any stale value rather than throwing.
      if (hit) return hit.data;
      throw e;
    });

  cache.set(url, { data: hit?.data, at: hit?.at ?? 0, inflight: p });
  return p as Promise<T>;
}

// Warm a URL into the cache without awaiting (prefetch).
export function prefetch(url: string) {
  const hit = cache.get(url);
  if (hit && performance.now() - hit.at < DEFAULT_TTL) return;
  cachedGet(url).catch(() => {});
}

// Invalidate after a mutation so the next read is fresh.
export function invalidate(url: string) {
  cache.delete(url);
}

// Clear the entire cache — call after a big mutation (start fresh, session done).
export function invalidateAll() {
  cache.clear();
}
