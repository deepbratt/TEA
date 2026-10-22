import { ConfigEditor } from '@/components/ConfigEditor';
import { tea } from '@/lib/tea';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Config file' };

export default async function ConfigPage() {
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
            Everything on the other pages lives in <code>{workspace.file}</code>. Edit it here or in your editor and commit it with your code; the
            Workbench keeps your comments when it saves.
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
      <ConfigEditor initial={text} />
    </>
  );
}
