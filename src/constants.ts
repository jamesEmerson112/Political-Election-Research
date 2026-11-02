/** Organization types that are political committees (can receive contributions / make IEs). */
export const COMMITTEE_ORG_TYPES = new Set([
  "candidate_committee",
  "ballot_measure_committee",
  "general_purpose_pac",
  "ie_committee",
  "political_party",
]);

/** Source kinds that are official disclosure filings. */
export const FILING_SOURCE_KINDS = new Set(["campaign_finance_filing", "lobbying_filing", "behested_payment_filing"]);

/** Source kinds whose citations must carry a locator (timestamp, schedule/line, ...). */
export const LOCATOR_SOURCE_KINDS = new Set([...FILING_SOURCE_KINDS, "video"]);

/** Relationship types that represent money and must cite a filing. */
export const MONEY_REL_TYPES = new Set(["contribution", "independent_expenditure", "lobbying", "behested_payment"]);

/** committee_role roles that count toward a candidate's funding for a contest. */
export const COUNTED_COMMITTEE_ROLES = new Set(["principal_campaign", "authorized", "ca_controlled"]);

/** Contribution forms that count as receipts in rollups (transfers and refunds never do). */
export const COUNTED_CONTRIBUTION_FORMS = new Set(["monetary", "in_kind"]);

/** The symmetric attribute set every candidate is researched on, in task order. */
export const PROFILE_FIELDS = [
  "party_registration",
  "birth_date",
  "birthplace",
  "occupation",
  "residence_city",
  "offices_held",
  "education",
  "career",
] as const;

/** Dossier sections every candidate is researched on, in task order. */
export const DOSSIER_SECTIONS = ["track_record", "promises", "controversies"] as const;

/** Source kinds that count as an official record for controversy sourcing. */
export const OFFICIAL_SOURCE_KINDS = new Set([...FILING_SOURCE_KINDS, "government_record", "legislative_record"]);

/** Free-text keys never scanned for refs. */
export const FREE_TEXT_KEYS = new Set([
  "$schema",
  "quote",
  "summary",
  "notes",
  "note",
  "text",
  "title",
  "name",
  "value",
  "description",
  "query",
  "where",
  "reason",
  "support_means",
  "oppose_means",
  "office",
  "institution",
  "degree",
  "role",
  "url",
  "archive_url",
]);
