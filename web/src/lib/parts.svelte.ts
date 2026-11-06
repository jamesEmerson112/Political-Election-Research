import type { Bundle, Lazy, LazyPart, Rec, Task } from "./data";

/**
 * The draft's on-demand parts (the research queue's tasks, the unverified leads), fetched once when a page that uses
 * them opens. They are files next to the page (same origin, so the security policy's connect-src 'self' allows them).
 * A copy of the page that carries them inline (web/to-artifact.py) sets window.__PARTS__ and nothing is fetched.
 */
type Records = Pick<Bundle, "people" | "organizations" | "positions" | "relationships" | "sources" | "dossiers" | "bills" | "rollups">;
type Loaded = { tasks?: Task[]; leads?: Rec[]; records?: Records };
export const parts = $state<{ loaded: Loaded; failed: LazyPart[] }>({ loaded: {}, failed: [] });
const pending = new Map<LazyPart, Promise<unknown>>();

function fetchPart(lazy: Lazy, part: LazyPart): Promise<unknown> {
  const url = lazy[part]!;
  let p = pending.get(part);
  if (!p) {
    const g = globalThis as { __PARTS__?: Record<string, unknown>; __PREFETCH__?: Record<string, Promise<unknown>> };
    const inline = g.__PARTS__?.[url];
    // The page head may have started this fetch already (web/vite.config.ts); otherwise fetch it now.
    const early = g.__PREFETCH__?.[url];
    if (early) delete g.__PREFETCH__![url];
    const get = () => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url}: HTTP ${r.status}`))));
    p = (inline !== undefined ? Promise.resolve(inline) : early ? early.catch(get) : get()).catch((e: unknown) => {
      pending.delete(part);
      throw e;
    });
    pending.set(part, p);
  }
  return p;
}

/**
 * Load parts a page needs, all in one go: they join the dataset together, so the index is rebuilt and the page drawn
 * once, not once per part.
 */
export function need(lazy: Lazy | undefined, ...list: LazyPart[]): void {
  if (!lazy) return;
  const todo = list.filter((p) => lazy[p] && !parts.loaded[p]);
  if (!todo.length) return;
  Promise.all(todo.map((p) => fetchPart(lazy, p)))
    .then((values) => {
      if (todo.every((p) => parts.loaded[p])) return;
      const next: Loaded = { ...parts.loaded };
      todo.forEach((p, i) => ((next as Record<string, unknown>)[p] = values[i]));
      parts.loaded = next;
      parts.failed = parts.failed.filter((p) => !todo.includes(p));
    })
    .catch(() => {
      parts.failed = [...new Set([...parts.failed, ...todo])];
    });
}

/** The draft with whatever parts have arrived merged in (their file paths dropped from `lazy`, the counts kept). */
export function withParts<B extends Bundle & { lazy?: Lazy }>(b: B, loaded: Loaded): B {
  if (!b.lazy) return b;
  const lazy = { ...b.lazy };
  const out: B = { ...b };
  if (loaded.tasks) {
    out.tasks = loaded.tasks;
    delete lazy.tasks;
  }
  if (loaded.leads) {
    out.leads = loaded.leads;
    delete lazy.leads;
  }
  if (loaded.records) {
    Object.assign(out, loaded.records);
    delete lazy.records;
  }
  out.lazy = lazy;
  return out;
}
