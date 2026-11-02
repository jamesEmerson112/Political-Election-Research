/**
 * Deterministic identifiers. Every id in the dataset is a pure function of
 * record content, so two agents researching the same thing produce the same
 * file at the same path.
 */
import { createHash } from "node:crypto";

export const REF_KINDS = ["person", "org", "election", "contest", "q", "src"] as const;
export type RefKind = (typeof REF_KINDS)[number];

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
export const REF_RE = new RegExp(`^(person|org|election|contest|q|src):(${SLUG}(?:/${SLUG})?)$`);

/** "Xavier Becerra" -> "xavier-becerra"; "AT&T Inc." -> "at-and-t-inc" */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

const TRACKING_PARAMS = /^(utm_.*|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref_src|_ga)$/i;

/**
 * Canonical form of a URL, used only for identity (never for fetching):
 * https scheme, lowercase host without "www.", no fragment, no tracking
 * params, sorted query, no trailing slash (except root).
 */
export function canonicalUrl(raw: string): string {
  const u = new URL(raw.trim());
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Unsupported URL scheme: ${raw}`);
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const port = u.port && u.port !== "80" && u.port !== "443" ? `:${u.port}` : "";
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.test(k))
    .sort(([a, av], [b, bv]) => (a === b ? cmp(av, bv) : cmp(a, b)));
  const query = params.length
    ? "?" + params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")
    : "";
  let path = u.pathname || "/";
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return `https://${host}${port}${path}${query}`;
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** Source id: "<host-slug>-<10 hex of sha256(canonical url)>". */
export function sourceId(url: string): string {
  const canon = canonicalUrl(url);
  const host = new URL(canon).hostname;
  return `${slugify(host)}-${sha256Hex(canon).slice(0, 10)}`;
}

export interface ParsedRef {
  kind: RefKind;
  /** Everything after the colon, e.g. "2026-ca-general/governor". */
  key: string;
}

export function parseRef(ref: string): ParsedRef | null {
  const m = REF_RE.exec(ref);
  if (!m) return null;
  return { kind: m[1] as RefKind, key: m[2]! };
}

/** "person:x" -> "person.x"; "contest:2026-ca-general/prop-3" -> "contest.2026-ca-general.prop-3" */
export function refToken(ref: string): string {
  return ref.replace(":", ".").replaceAll("/", ".");
}

type Rec = Record<string, unknown>;

function s(rec: Rec, key: string): string {
  const v = rec[key];
  if (typeof v !== "string" && typeof v !== "number") {
    throw new Error(`Cannot compute id: field "${key}" is missing`);
  }
  return String(v);
}

function moneyPeriod(rec: Rec): { start: string; end: string } {
  const money = rec["money"] as Rec | undefined;
  const period = money?.["period"] as Rec | undefined;
  if (!period || typeof period["start"] !== "string" || typeof period["end"] !== "string") {
    throw new Error('Cannot compute id: field "money.period" is missing');
  }
  return { start: period["start"], end: period["end"] };
}

/** Deterministic relationship id. Throws if a field needed for the id is missing. */
export function relationshipId(rec: Rec): string {
  const type = s(rec, "type");
  const t = (k: string) => refToken(s(rec, k));
  switch (type) {
    case "endorsement":
      return ["endorsement", t("endorser"), t("endorsee"), s(rec, "cycle")].join("--");
    case "committee_role":
      return ["committee_role", t("committee"), t("subject"), s(rec, "role"), s(rec, "cycle")].join("--");
    case "contribution":
      return [
        "contribution",
        t("donor"),
        t("recipient"),
        s(rec, "cycle"),
        s(rec, "election_designation"),
        s(rec, "form"),
      ].join("--");
    case "independent_expenditure":
      return [
        "independent_expenditure",
        t("spender"),
        t("target"),
        s(rec, "side"),
        s(rec, "cycle"),
        s(rec, "election_designation"),
      ].join("--");
    case "lobbying": {
      const p = moneyPeriod(rec);
      const firm = typeof rec["firm"] === "string" ? refToken(rec["firm"]) : "in-house";
      return ["lobbying", t("client"), firm, s(rec, "jurisdiction"), p.start, p.end].join("--");
    }
    case "behested_payment":
      return ["behested_payment", t("official"), t("payor"), t("payee"), s(rec, "date")].join("--");
    case "affiliation":
      return ["affiliation", t("person"), t("organization"), s(rec, "role")].join("--");
    case "legislative_action":
      return ["legislative_action", t("person"), s(rec, "bill"), s(rec, "action"), s(rec, "date")].join("--");
    default:
      throw new Error(`Unknown relationship type: ${type}`);
  }
}

export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
