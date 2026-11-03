import type { Citation, Lead, SearchEntry } from "./data";

export interface Detail {
  kicker?: string;
  title: string;
  /** Plain label/value facts. */
  facts?: Array<[string, string]>;
  text?: string;
  citations?: Citation[];
  searchLog?: SearchEntry[];
  leads?: Lead[];
  /** Earlier dated entries (positions history). */
  history?: Array<{ label: string; text: string; citations: Citation[] }>;
  /** Titled groups, each with its own citations (office connections). */
  groups?: { title: string; items: Array<{ label: string; text: string; list?: string[]; citations: Citation[] }> };
  /** External pages (legal basis, official site, CivLab). */
  links?: Array<{ label: string; href: string; sub?: string }>;
  note?: string;
}

export interface Tip {
  x: number;
  y: number;
  lines: string[];
}

export const ui = $state<{ detail: Detail | null; tip: Tip | null }>({ detail: null, tip: null });

export function openDetail(d: Detail): void {
  ui.detail = d;
}

export function showTip(e: MouseEvent | FocusEvent, lines: string[]): void {
  const target = e.currentTarget as Element | null;
  if (e instanceof MouseEvent && e.type !== "focus") {
    ui.tip = { x: e.clientX, y: e.clientY, lines };
  } else if (target) {
    const r = target.getBoundingClientRect();
    ui.tip = { x: r.left + r.width / 2, y: r.top, lines };
  }
}

export function hideTip(): void {
  ui.tip = null;
}

const KEY = "per-dataset";
export function loadDatasetChoice(): "draft" | "demo" {
  try {
    const v = localStorage.getItem(KEY);
    return v === "demo" ? "demo" : "draft";
  } catch {
    return "draft";
  }
}
export function saveDatasetChoice(v: "draft" | "demo"): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage unavailable: the choice just isn't remembered */
  }
}
