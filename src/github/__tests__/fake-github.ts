// Test helpers shared by the GitHub and UI tests: a fake GitHub API/OAuth server and a local git repo.
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const FAKE_TOKEN = ['ghp', 'FAKEtokenFAKEtokenFAKEtoken0000'].join('_');

/** A fake GitHub API + OAuth server, shared with the UI tests. */
export function fakeGitHub(): Server {
  let polls = 0;
  return createServer((req, res) => {
    const url = new URL(req.url!, 'http://x');
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === '/login/device/code') return send(200, { device_code: 'dev-1', user_code: 'WDJB-MJHT', verification_uri: 'https://github.com/login/device', interval: 5, expires_in: 900 });
    if (url.pathname === '/login/oauth/access_token') return send(200, ++polls < 2 ? { error: 'authorization_pending' } : { access_token: FAKE_TOKEN });
    if (req.headers.authorization !== `Bearer ${FAKE_TOKEN}`) return send(401, { message: 'Bad credentials' });
    if (url.pathname === '/user') return send(200, { login: 'mira-example', name: 'Mira Example' });
    if (url.pathname === '/user/repos') {
      return send(200, [
        { name: 'leaf-kettle', full_name: 'mira-example/leaf-kettle', private: true, default_branch: 'main', pushed_at: '2026-10-20T00:00:00Z', description: 'Tea shop', owner: { login: 'mira-example' } },
        { name: 'notes', full_name: 'mira-example/notes', private: false, default_branch: 'trunk', owner: { login: 'mira-example' } },
      ]);
    }
    if (url.pathname === '/repos/mira-example/leaf-kettle/branches') return send(200, [{ name: 'main' }, { name: 'feature/checkout' }]);
    if (url.pathname === '/repos/mira-example/leaf-kettle') return send(200, { homepage: 'https://leaf-kettle.example.com' });
    if (url.pathname === '/repos/mira-example/leaf-kettle/deployments') return send(200, [{ id: 7, environment: 'Preview' }]);
    if (url.pathname === '/repos/mira-example/leaf-kettle/deployments/7/statuses') return send(200, [{ state: 'success', environment_url: 'https://leaf-kettle-git-feature.example.app' }]);
    send(404, { message: 'Not Found' });
  });
}

export async function makeGitRepo(base: string, owner: string, repo: string): Promise<void> {
  const dir = join(base, owner, repo);
  await mkdir(join(dir, 'app'), { recursive: true });
  await writeFile(join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '16', react: '19' } }));
  await writeFile(join(dir, 'app', 'page.tsx'), 'export default function H(){ return <a href="/broken">x</a> }');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'add', '.');
  git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-qm', 'init');
}
