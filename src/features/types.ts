/**
 * Feature-by-feature QA. TEA lists every feature it can find (from the code and from the docs your
 * AI agents wrote), gives each one a test plan, runs that plan, and reports per feature.
 */

/** done: the docs say it's built. planned: the docs say it's coming (a TODO, a roadmap item). */
export type ClaimStatus = 'done' | 'planned';

/** Something a claim needs that TEA could not find in the code. */
export interface MissingPart {
  /** Stable id, used in finding ids: "csv-export", "/api/health", "wishlist". */
  key: string;
  /** What's missing, in plain words: "CSV export". */
  label: string;
  /** Why TEA thinks it's missing. */
  why: string;
}

/** One line from a doc that says a feature exists or is coming. */
export interface Claim {
  text: string;
  file: string;
  line: number;
  status: ClaimStatus;
  /** What TEA found in the code that backs the claim, e.g. "page /shop", "dependency stripe". */
  found: string[];
  missing: MissingPart[];
  /** False when TEA found nothing for or against it: check it by hand. */
  verified: boolean;
}

export type CheckKind = 'static' | 'live' | 'sandbox' | 'docs';
export type CheckResult = 'pass' | 'fail' | 'skip';

/** One step of a feature's test plan, and what happened when TEA ran it. */
export interface FeatureCheck {
  id: string;
  kind: CheckKind;
  given?: string;
  when: string;
  then: string;
  result: CheckResult;
  /** Why it failed or was skipped, or what TEA saw. */
  detail?: string;
  /** Ids of the issues that made it fail. */
  findings?: string[];
}

export const FEATURE_STATUSES = ['works', 'broken', 'partial', 'missing', 'not-built-yet', 'untested'] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export interface Feature {
  /** Stable id from the code (route segment) or the docs, e.g. "checkout", "password-reset". */
  key: string;
  name: string;
  /** Where TEA learned about it: the code, the docs, or both. */
  origin: 'code' | 'docs' | 'both';
  pages: string[];
  /** API routes it serves, "GET /api/plans". */
  endpoints: string[];
  /** API calls its pages make, "POST /api/signup". */
  calls: string[];
  /** Forms, as "file:line" (from the code) or page URLs (from the live app). */
  forms: string[];
  files: string[];
  models: string[];
  /** Services it uses: Stripe, Supabase Auth... */
  integrations: string[];
  claims: Claim[];
  /** The test plan, with results once it ran. */
  checks: FeatureCheck[];
  status: FeatureStatus;
  /** Ids of every issue linked to this feature. */
  findings: string[];
}

export interface FeatureSummary {
  total: number;
  works: number;
  broken: number;
  partial: number;
  missing: number;
  notBuiltYet: number;
  untested: number;
  /** Share of the features that exist that TEA saw working, 0-100; null when nothing was tested live. */
  coverage: number | null;
}

export interface FeatureReport {
  /** Every feature, hidden ones included; hidden ones aren't counted in the summary. */
  features: Feature[];
  /** The docs TEA read for claims. */
  docs: string[];
  /** True when sandbox tests (form submissions with test data) ran. */
  sandbox: boolean;
  /** Feature keys hidden in the project settings. */
  hidden: string[];
  summary: FeatureSummary;
}
