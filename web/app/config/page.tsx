import { live } from '@/lib/live';
import { basename } from 'node:path';
import { ConfigEditor } from '@/components/ConfigEditor';
import { shownPath } from '@/lib/mode';
import { tea } from '@/lib/tea';

export const metadata = { title: 'Config file' };

export default async function ConfigPage() {
  await live();
  const { engine, services } = await tea();
  const { workspace } = services;
  const text = await workspace.text();
  // Shown even when the file is broken, so it can be fixed here.
  const problem = await workspace.read().then(
    () => null,
    (err: unknown) => (err instanceof engine.WorkspaceError ? { message: engine.mask(err.message), problems: err.problems.map(engine.mask) } : null),
  );
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Config file</h1>
          <p className="help">
            Everything on the other pages lives in <code>{shownPath(workspace.file)}</code>: projects, rules, your own rules and the quality gate. You rarely
            need this page: the other pages edit it for you. Use it to copy settings to another computer (Download / Import), to commit them with
            your code, or to start over. Comments you write are kept.
          </p>
        </div>
      </div>
      {problem && (
        <div className="card error" role="alert">
          <p>{problem.message}</p>
          <ul>
            {problem.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <ConfigEditor initial={text} defaultText={engine.defaultWorkspaceText()} fileName={basename(workspace.file)} />
    </>
  );
}
