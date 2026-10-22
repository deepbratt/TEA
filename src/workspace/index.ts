import { catalogFromEnv, effectiveRule, isPlanned, loadCatalog, type Catalog, type CheckParam, type Rules } from '../core/index.js';
import { Workspace, WorkspaceError } from './config.js';
import { RunManager } from './runs.js';

export { CustomRuleSchema, CUSTOM_RULE_TEMPLATES, CUSTOM_RULE_TYPES, type CustomRule } from '../custom/index.js';
export { Workspace, WorkspaceError, WORKSPACE_FILE, defaultWorkspaceText, keyFromName, ProjectSchema, SourceSchema, type Project, type WorkspaceData } from './config.js';
export { RunManager, RunBusyError, type RunRecord } from './runs.js';
export { listFolders, type FolderListing } from './folders.js';

export interface RuleView {
  id: string;
  title: string;
  /** Plain English: what the check catches. */
  description: string;
  category: string;
  /** Its detector isn't built yet: shown so people see what's coming; turning it on does nothing yet. */
  planned: boolean;
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
      description: e.description ?? e.title,
      category: e.category,
      planned: isPlanned(e),
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
  const catalog = await loadCatalog(catalogFromEnv());
  const workspace = new Workspace(opts.workspaceFile, catalog);
  // Create the file with defaults when missing. An invalid file is reported per request instead,
  // so the UI can still open it for fixing.
  await workspace.read().catch((err: unknown) => {
    if (!(err instanceof WorkspaceError)) throw err;
  });
  return { workspace, runs: new RunManager(workspace, opts.runsDir), catalog };
}
