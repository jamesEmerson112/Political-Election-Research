const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export function money(cents: number | null | undefined): string {
  return usd.format((cents ?? 0) / 100);
}
export function moneyCompact(cents: number | null | undefined): string {
  return usdCompact.format((cents ?? 0) / 100);
}
export function date(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

export const STANCE_LABEL: Record<string, string> = {
  support: "Supports",
  oppose: "Opposes",
  mixed: "Mixed",
  declined_to_answer: "Declined to answer",
  no_public_position: "No public position",
};

export const EVIDENCE_LABEL: Record<string, string> = {
  statement: "Public statement",
  questionnaire: "Questionnaire",
  vote: "Vote",
  authored_legislation: "Authored legislation",
  executive_action: "Executive action",
  platform: "Campaign platform",
  debate: "Debate",
  interview: "Interview",
};

export const SOURCE_KIND_LABEL: Record<string, string> = {
  campaign_finance_filing: "Campaign finance filing",
  lobbying_filing: "Lobbying filing",
  behested_payment_filing: "Behested payment filing",
  government_record: "Government record",
  legislative_record: "Legislative record",
  candidate_website: "Candidate website",
  candidate_questionnaire: "Candidate questionnaire",
  debate_transcript: "Debate transcript",
  video: "Video",
  press_release: "Press release",
  news_report: "News report",
  voter_guide: "Voter guide",
  social_media: "Social media",
};

export const ORG_TYPE_LABEL: Record<string, string> = {
  labor_union: "Labor union",
  corporation: "Corporation",
  trade_association: "Trade association",
  nonprofit_501c3: "Nonprofit (501(c)(3))",
  nonprofit_501c4: "Nonprofit (501(c)(4))",
  political_party: "Political party",
  candidate_committee: "Candidate committee",
  ballot_measure_committee: "Ballot measure committee",
  general_purpose_pac: "PAC",
  ie_committee: "Independent expenditure committee",
  conduit: "Conduit platform",
  lobbying_firm: "Lobbying firm",
  government_body: "Government body",
  tribe: "Tribe",
  other: "Organization",
};

export const ROLE_LABEL: Record<string, string> = {
  principal_campaign: "Principal campaign committee",
  authorized: "Authorized committee",
  ca_controlled: "Candidate-controlled committee",
  officeholder: "Officeholder account",
  leadership_pac: "Leadership PAC",
  jfc_participant: "Joint fundraising committee",
  legal_defense: "Legal defense fund",
  controlled_ballot_measure: "Controlled ballot measure committee",
  primarily_formed_support: "Formed to support",
  primarily_formed_oppose: "Formed to oppose",
};

export const PROFILE_LABEL: Record<string, string> = {
  party_registration: "Party",
  occupation: "Occupation",
  residence_city: "Residence",
  offices_held: "Offices held",
  education: "Education",
};

export const TASK_LABEL: Record<string, string> = {
  election: "Create election record",
  contest: "Verify contest on official list",
  candidacy: "Verify candidacy",
  person: "Create candidate record",
  profile: "Profile field",
  position: "Stance",
  endorsements: "Endorsements",
  committee: "Campaign committee",
  measure_committees: "Measure committees",
  finance_cutoff: "Choose finance cutoff",
  contributions: "Top contributors",
  independent_expenditures: "Outside spending",
};

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
