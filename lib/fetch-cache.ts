// Client-side GET cache so the app feels instant.
//
// Two layers:
//   1) In-memory Map (per tab) — fastest, cleared when the tab closes.
//   2) localStorage (opt-in via { persist: true }) — survives reload/reopen so
//      read-heavy screens (profile, plan, goals) paint instantly on cold-open,
//      then revalidate in the background (stale-while-revalidate from disk).
//
// Correctness rule: NEVER show stale data after a write. Every mutation path
// calls invalidate()/invalidateAll(), and those wipe BOTH layers — so a
// persisted value can never outlive the write that changed it.

type Entry = { data: any; at: number; inflight?: Promise<any> };
const cache = new Map<string, Entry>();
const DEFAULT_TTL = 60_000; // 1 min fresh (in-memory)
const DISK_TTL = 24 * 60 * 60_000; // 24h fresh (localStorage)
const DISK_PREFIX = "butler:cache:";

// localStorage is namespaced per user so a shared machine never leaks one
// account's cached profile into another's. setCacheOwner() is called on
// auth-state changes; changing owner drops all persisted entries.
let owner = "anon";
function diskKey(url: string) {
  return `${DISK_PREFIX}${owner}:${url}`;
}

function readDisk(url: string): Entry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(diskKey(url));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: any; at: number };
    if (!parsed || typeof parsed.at !== "number") return null;
    // Wall-clock TTL (Date.now, not performance.now — this survives reloads).
    if (Date.now() - parsed.at > DISK_TTL) {
      window.localStorage.removeItem(diskKey(url));
      return null;
    }
    // Re-base the timestamp onto performance.now for the in-memory freshness math.
    return { data: parsed.data, at: performance.now() - (Date.now() - parsed.at) };
  } catch {
    return null;
  }
}

function writeDisk(url: string, data: any) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(diskKey(url), JSON.stringify({ data, at: Date.now() }));
  } catch {
    // Quota exceeded / private mode — degrade gracefully to memory-only.
  }
}

function removeDisk(url: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(diskKey(url));
  } catch {
    /* ignore */
  }
}

function clearDiskAll() {
  if (typeof window === "undefined") return;
  try {
    const ls = window.localStorage;
    const kill: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(DISK_PREFIX)) kill.push(k);
    }
    kill.forEach((k) => ls.removeItem(k));
  } catch {
    /* ignore */
  }
}

// Call on login/logout. A different owner means the previous account's
// persisted cache must not be visible — drop it all.
export function setCacheOwner(id: string | null | undefined) {
  const next = id || "anon";
  if (next === owner) return;
  owner = next;
  cache.clear();
  clearDiskAll();
}

export async function cachedGet<T = any>(
  url: string,
  { ttl = DEFAULT_TTL, force = false, persist = false }: { ttl?: number; force?: boolean; persist?: boolean } = {}
): Promise<T> {
  const now = performance.now();
  let hit = cache.get(url);

  // Warm the in-memory layer from disk on first touch this tab.
  if (!hit && persist) {
    const disk = readDisk(url);
    if (disk) {
      cache.set(url, disk);
      hit = disk;
    }
  }

  // Fresh enough — return immediately.
  if (!force && hit && now - hit.at < ttl) return hit.data as T;

  // De-dupe concurrent requests.
  if (hit?.inflight) return hit.inflight as Promise<T>;

  const p = fetch(url)
    .then((r) => r.json())
    .then((data) => {
      cache.set(url, { data, at: performance.now() });
      if (persist) writeDisk(url, data);
      return data;
    })
    .catch((e) => {
      // On failure, fall back to any stale value rather than throwing.
      if (hit) return hit.data;
      throw e;
    });

  cache.set(url, { data: hit?.data, at: hit?.at ?? 0, inflight: p });
  // If we have a stale-but-usable value (memory or disk), return it now and let
  // the fetch refresh in the background (stale-while-revalidate).
  if (!force && hit && hit.data !== undefined) return hit.data as T;
  return p as Promise<T>;
}

// Warm a URL into the cache without awaiting (prefetch).
export function prefetch(url: string, opts: { persist?: boolean } = {}) {
  const hit = cache.get(url);
  if (hit && performance.now() - hit.at < DEFAULT_TTL) return;
  cachedGet(url, opts).catch(() => {});
}

// Invalidate after a mutation so the next read is fresh — clears BOTH layers so
// nothing stale can survive the write.
export function invalidate(url: string) {
  cache.delete(url);
  removeDisk(url);
}

// Clear the entire cache — call after a big mutation (start fresh, session done).
export function invalidateAll() {
  cache.clear();
  clearDiskAll();
}
