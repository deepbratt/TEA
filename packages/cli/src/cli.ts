import { Command, InvalidArgumentError, Option } from 'commander';
import { ConfigError, SEVERITIES, log, setLogLevel } from '@tea-qa/core';
import { showNoticeOnce } from './notice.js';
import { run, UsageError, VERSION } from './run.js';

const int = (v: string) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1) throw new InvalidArgumentError('must be a positive number');
  return n;
};
const collect = (v: string, prev: string[] = []) => [...prev, v];

export function buildProgram(): Command {
  const program = new Command('tea-qa')
    .description('TEA: Test Everything Automatically. Spill the TEA on your app.')
    .version(VERSION)
    .showHelpAfterError();

  program
    .command('run', { isDefault: true })
    .description('Test a web app by URL, by repo, or both. No config needed.')
    .argument('[target]', 'a URL (https://...) or a repo folder (./app)')
    .option('--url <url>', 'URL of the running app to test')
    .option('--repo <path>', 'folder with the app source code')
    .option('-o, --out <dir>', 'where to write the report', 'tea-report')
    .option('-c, --config <file>', 'tea.yaml to use (default: <repo>/tea.yaml or ./tea.yaml)')
    .option('--max-pages <n>', 'most pages to visit', int)
    .addOption(new Option('--fail-on <severity>', 'exit 1 when an issue is at least this severe').choices([...SEVERITIES.filter((s) => s !== 'info'), 'none']))
    .option('--skip <glob>', 'route to never visit, e.g. "/admin/**" (repeatable)', collect)
    .option('--allow <host>', 'extra host TEA may visit (repeatable)', collect)
    .option('--login <email:password>', 'test account to use (masked everywhere)')
    .option('--no-ai', 'rules only, no LLM calls')
    .option('--no-screenshots', 'do not save page screenshots')
    .option('--start', 'in code-only mode, start the app with its own dev script without asking (runs code from the repo)')
    .option('--no-start', 'never start the app locally in code-only mode')
    .option('--trust-repo-plugins', "load plugins listed in the repo's tea.yaml (they run as code)")
    .option('--dry-run', 'show what TEA would do, and the estimated cost, without doing it')
    .option('-v, --verbose', 'show more detail')
    .option('-q, --quiet', 'only print warnings and errors')
    .action(async (target: string | undefined, o) => {
      setLogLevel(o.quiet ? 'quiet' : o.verbose ? 'verbose' : 'normal');
      showNoticeOnce();
      const outcome = await run({
        target,
        url: o.url,
        repo: o.repo,
        out: o.out,
        config: o.config,
        maxPages: o.maxPages,
        failOn: o.failOn,
        skip: o.skip,
        allow: o.allow,
        login: o.login,
        ai: o.ai,
        screenshots: o.screenshots,
        start: o.start,
        trustRepoPlugins: o.trustRepoPlugins,
        dryRun: o.dryRun,
      });
      process.exitCode = outcome.exitCode;
    });

  return program;
}

export async function main(argv = process.argv): Promise<void> {
  try {
    await buildProgram().parseAsync(argv);
  } catch (err) {
    if (err instanceof UsageError || err instanceof ConfigError) {
      log.error(err.message);
      process.exitCode = 2;
    } else {
      log.error(`TEA crashed: ${(err as Error).stack ?? err}`);
      process.exitCode = 3;
    }
  }
}
