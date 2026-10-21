export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const AREAS = ['functional', 'api', 'security', 'performance', 'accessibility', 'load', 'code'] as const;
export type Area = (typeof AREAS)[number];

export interface Evidence {
  url?: string;
  screenshot?: string;
  video?: string;
  file?: string;
  line?: number;
  snippet?: string;
  details?: string[];
}

export interface Finding {
  /** Stable id so reruns can be compared, e.g. "crawl.server-error:/pricing". */
  id: string;
  area: Area;
  severity: Severity;
  title: string;
  /** Plain English for a non-technical founder. */
  summary: string;
  steps?: string[];
  evidence?: Evidence;
  /** A prompt the founder can paste straight into their AI coding tool. */
  fix?: string;
  /** Which check produced it, e.g. "crawler". */
  source: string;
}

export type StackKind =
  | 'framework'
  | 'backend'
  | 'database'
  | 'auth'
  | 'payments'
  | 'mobile'
  | 'ai'
  | 'hosting'
  | 'builder'
  | 'language';

export interface StackDetection {
  id: string;
  name: string;
  kind: StackKind;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

export interface Route {
  path: string;
  kind: 'page' | 'api';
  methods?: string[];
  file?: string;
  line?: number;
  dynamic: boolean;
  source: 'code' | 'ui' | 'both';
  plugin?: string;
  /** Filled after the crawl: last HTTP status seen for this route. */
  status?: number;
  reachableFromUi?: boolean;
}

export interface FormField {
  name?: string;
  type?: string;
  required?: boolean;
  label?: string;
}

export interface FormInfo {
  /** "file:line" for code forms, page URL for UI forms. */
  location: string;
  action?: string;
  method?: string;
  fields: FormField[];
}

export interface EnvVar {
  name: string;
  /** True when the name is bundled into client code (NEXT_PUBLIC_, VITE_, EXPO_PUBLIC_...). */
  clientExposed: boolean;
  files: string[];
}

export interface DatabaseInfo {
  kind: string;
  models: string[];
  file?: string;
}

export interface FailedRequest {
  url: string;
  method: string;
  status?: number;
  error?: string;
  resourceType?: string;
}

export interface PageVisit {
  url: string;
  path: string;
  status?: number;
  title?: string;
  loadMs?: number;
  screenshot?: string;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: FailedRequest[];
  links: string[];
  buttons: string[];
  forms: FormInfo[];
  brokenImages: string[];
  /** Pages that linked here. */
  referrers: string[];
  error?: string;
  seededFromCode?: boolean;
  /** HTTP 200 but the page renders a "not found" view (common in SPAs). */
  softNotFound?: boolean;
  /** The page redirected to a host or route outside the scope; TEA discarded it. */
  redirectedOutOfScope?: boolean;
}

export interface Discovery {
  stack: StackDetection[];
  routes: Route[];
  forms: FormInfo[];
  auth: string[];
  envVars: EnvVar[];
  envFiles: string[];
  database: DatabaseInfo[];
  payments: string[];
  openapi: string[];
  notes: string[];
}

export interface AppMap extends Discovery {
  generatedAt: string;
  target: { url?: string; repo?: string };
  pages: PageVisit[];
}

export interface AreaScore {
  area: Area;
  score: number | null;
  status: 'ran' | 'not-run';
  findings: number;
}

export interface Results {
  tool: { name: string; version: string };
  startedAt: string;
  finishedAt: string;
  target: { url?: string; repo?: string };
  score: number | null;
  areas: AreaScore[];
  findings: Finding[];
  summary: string;
  ran: string[];
  notRun: string[];
}
