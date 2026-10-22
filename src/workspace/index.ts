import { effectiveRule, loadCatalog, packsFromEnv, type Catalog, type CheckParam, type Rules } from '../core/index.js';
import { Workspace, WorkspaceError } from './config.js';
import { RunManager } from './runs.js';

export { Workspace, WorkspaceError, WORKSPACE_FILE, keyFromName, ProjectSchema, SourceSchema, type Project, type WorkspaceData } from './config.js';
export { RunManager, RunBusyError, type RunRecord } from './runs.js';
export { listFolders, type FolderListing } from './folders.js';

export interface RuleView {
  id: string;
  title: string;
  category: string;
  pack: 'free' | 'pro';
  /** Pro checks without a licensed pack: shown, not editable. */
  locked: boolean;
  defaultSeverity: string;
  enabled: boolean;
  severity: string;
  params: (CheckParam & { name: string; value: number | string | boolean })[];
}

/** Every check in the catalog with the user's settings applied: what the Rules page shows. */
export function rulesView(catalog: Catalog, rules: Rules): RuleView[] {
  return catalog.entries.map((e) => {
    const r = effectiveRule(catalog, rules, e.id)!;
    return {
      id: e.id,
      title: e.title,
      category: e.category,
      pack: e.pack,
      locked: e.pack === 'pro' && !e.rule,
      defaultSeverity: e.severity,
      enabled: r.enabled,
      severity: r.severity,
      params: Object.entries(e.params ?? {}).map(([name, spec]) => ({ ...spec, name, value: r.params[name] ?? spec.default })),
    };
  });
}

export interface Services {
  workspace: Workspace;
  runs: RunManager;
  catalog: Catalog;
}

/** Everything the Workbench backend needs, for one workspace file. */
export async function createServices(opts: { workspaceFile: string; runsDir?: string }): Promise<Services> {
  const catalog = await loadCatalog(packsFromEnv());
  const workspace = new Workspace(opts.workspaceFile, catalog);
  // Create the file with defaults when missing. An invalid file is reported per request instead,
  // so the UI can still open it for fixing.
  await workspace.read().catch((err: unknown) => {
    if (!(err instanceof WorkspaceError)) throw err;
  });
  return { workspace, runs: new RunManager(workspace, opts.runsDir), catalog };
}
