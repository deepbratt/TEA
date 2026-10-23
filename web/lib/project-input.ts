import { HttpError } from './http';

export interface ProjectInput {
  name: string;
  url?: string;
  sources: { name: string; path: string; role: 'auto' | 'frontend' | 'backend' | 'fullstack' }[];
  maxPages?: number;
  skip?: string[];
  sandbox?: boolean;
}

/** Pick the editable fields of a project from a request body. The workspace schema validates them. */
export function projectInput(body: Record<string, unknown>): ProjectInput {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const name = str(body.name);
  if (!name) throw new HttpError(400, 'Give the project a name.');
  const sources = Array.isArray(body.sources) ? body.sources : [];
  const out: ProjectInput = {
    name,
    sources: sources.map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return { name: str(o.name), path: str(o.path), role: (str(o.role) || 'auto') as ProjectInput['sources'][number]['role'] };
    }),
  };
  if (str(body.url)) out.url = str(body.url);
  if (body.maxPages !== undefined && body.maxPages !== '') out.maxPages = Number(body.maxPages);
  if (body.sandbox === true) out.sandbox = true;
  if (Array.isArray(body.skip)) {
    const skip = body.skip.map(str).filter(Boolean);
    if (skip.length) out.skip = skip;
  }
  return out;
}
