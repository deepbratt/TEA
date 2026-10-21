/**
 * A tiny read-only GitHub API client: who am I, which repos can I see, branches, and live URLs
 * the repo advertises (homepage, recent deployments). TEA never writes to GitHub here.
 */

export const GITHUB_API = 'https://api.github.com';

export interface RepoSummary {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  pushedAt?: string;
  description?: string;
}

export class GitHubError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Owner, repo and branch names as GitHub allows them; also blocks option-looking values ("-x"). */
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const BRANCH = /^(?!-)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/-]{1,200}(?<![./])$/;

export function validRepoRef(owner: string, repo: string, branch?: string): boolean {
  return OWNER.test(owner) && REPO.test(repo) && !repo.startsWith('.') && (branch === undefined || BRANCH.test(branch));
}

export class GitHubClient {
  constructor(private token: string, private apiBase = GITHUB_API) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.apiBase}${path}`, {
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'tea-qa',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const msg = res.status === 401 ? 'GitHub rejected the token. Connect again.' : `GitHub answered ${res.status} for ${path.split('?')[0]}.`;
      throw new GitHubError(res.status, msg);
    }
    return (await res.json()) as T;
  }

  async user(): Promise<{ login: string; name?: string }> {
    const u = await this.get<{ login: string; name?: string }>('/user');
    return { login: u.login, name: u.name ?? undefined };
  }

  /** Repos the user can read, most recently pushed first. */
  async repos(page = 1, perPage = 50): Promise<RepoSummary[]> {
    const list = await this.get<
      { name: string; full_name: string; private: boolean; default_branch: string; pushed_at?: string; description?: string | null; owner: { login: string } }[]
    >(`/user/repos?per_page=${perPage}&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`);
    return list.map((r) => ({
      owner: r.owner.login,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      defaultBranch: r.default_branch,
      pushedAt: r.pushed_at,
      description: r.description ?? undefined,
    }));
  }

  async branches(owner: string, repo: string): Promise<string[]> {
    if (!validRepoRef(owner, repo)) throw new GitHubError(400, 'Not a valid repository name.');
    const list = await this.get<{ name: string }[]>(`/repos/${owner}/${repo}/branches?per_page=100`);
    return list.map((b) => b.name);
  }

  /**
   * Live URLs the repo points to: its homepage and the environment URLs of recent deployments
   * (Vercel, Netlify and Railway previews post these). Suggestions only: the user picks.
   */
  async liveUrls(owner: string, repo: string): Promise<{ url: string; source: string }[]> {
    if (!validRepoRef(owner, repo)) throw new GitHubError(400, 'Not a valid repository name.');
    const out: { url: string; source: string }[] = [];
    const add = (url: string | null | undefined, source: string) => {
      if (!url || !/^https?:\/\//i.test(url) || out.some((u) => u.url === url)) return;
      out.push({ url, source });
    };
    const meta = await this.get<{ homepage?: string | null }>(`/repos/${owner}/${repo}`);
    add(meta.homepage, 'repo homepage');
    try {
      const deployments = await this.get<{ id: number; environment: string }[]>(`/repos/${owner}/${repo}/deployments?per_page=5`);
      for (const d of deployments) {
        const statuses = await this.get<{ environment_url?: string; state: string }[]>(`/repos/${owner}/${repo}/deployments/${d.id}/statuses?per_page=1`);
        if (statuses[0]?.state === 'success') add(statuses[0].environment_url, `${d.environment} deployment`);
      }
    } catch {
      /* no deployments access: homepage only */
    }
    return out;
  }
}
