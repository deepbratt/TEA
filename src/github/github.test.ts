import type { Server } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cloneRepo, GitHubClient, pollDeviceFlow, startDeviceFlow, validRepoRef } from './index.js';
import { FAKE_TOKEN, fakeGitHub, makeGitRepo } from './__tests__/fake-github.js';

let server: Server;
let base: string;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tea-gh-'));
  server = fakeGitHub();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  await rm(dir, { recursive: true, force: true });
});

describe('GitHub client', () => {
  it('reads the user, repos, branches and live URLs', async () => {
    const gh = new GitHubClient(FAKE_TOKEN, base);
    expect((await gh.user()).login).toBe('mira-example');
    const repos = await gh.repos();
    expect(repos[0]).toMatchObject({ owner: 'mira-example', name: 'leaf-kettle', private: true, defaultBranch: 'main' });
    expect(await gh.branches('mira-example', 'leaf-kettle')).toEqual(['main', 'feature/checkout']);
    expect(await gh.liveUrls('mira-example', 'leaf-kettle')).toEqual([
      { url: 'https://leaf-kettle.example.com', source: 'repo homepage' },
      { url: 'https://leaf-kettle-git-feature.example.app', source: 'Preview deployment' },
    ]);
  });

  it('turns a bad token into a clear error', async () => {
    await expect(new GitHubClient('nope', base).user()).rejects.toThrow(/rejected the token/);
  });

  it('rejects names that could be read as git options or paths', () => {
    expect(validRepoRef('mira-example', 'leaf-kettle', 'feature/checkout')).toBe(true);
    for (const [o, r, b] of [['-x', 'r'], ['o', '../etc'], ['o', '.git'], ['o', 'r', '--upload-pack=x'], ['o', 'r', 'a..b'], ['o', 'r', 'x/']] as [string, string, string?][]) {
      expect(validRepoRef(o, r, b), `${o}/${r}@${b}`).toBe(false);
    }
  });
});

describe('device flow', () => {
  it('starts and polls until GitHub returns a token', async () => {
    const d = await startDeviceFlow('client-1', base);
    expect(d.userCode).toBe('WDJB-MJHT');
    expect(await pollDeviceFlow('client-1', d.deviceCode, base)).toEqual({ status: 'pending' });
    expect(await pollDeviceFlow('client-1', d.deviceCode, base)).toEqual({ status: 'done', token: FAKE_TOKEN });
  });
});

describe('cloneRepo', () => {
  it('makes a shallow clone without storing the token', async () => {
    const gitBase = join(dir, 'remote');
    await makeGitRepo(gitBase, 'mira-example', 'leaf-kettle');
    const path = await cloneRepo({ owner: 'mira-example', repo: 'leaf-kettle', branch: 'main', token: FAKE_TOKEN, cacheDir: join(dir, 'cache'), gitBase });
    expect(existsSync(join(path, 'app', 'page.tsx'))).toBe(true);
    expect(readFileSync(join(path, '.git', 'config'), 'utf8')).not.toContain(FAKE_TOKEN);
    // Cloning again replaces the old copy.
    const again = await cloneRepo({ owner: 'mira-example', repo: 'leaf-kettle', cacheDir: join(dir, 'cache'), gitBase });
    expect(again).toBe(path);
  });

  it('refuses invalid names before running git', async () => {
    await expect(cloneRepo({ owner: '-oops', repo: 'x', cacheDir: dir })).rejects.toThrow(/Not a valid/);
  });

  it('explains a failed clone', async () => {
    await expect(cloneRepo({ owner: 'nobody', repo: 'missing', cacheDir: join(dir, 'cache'), gitBase: join(dir, 'remote') })).rejects.toThrow(/git clone failed/);
  });
});
