// Two ways the Workbench is built:
//  - normal: the local app (`tea-qa ui`), rendered on each request from your real config file;
//  - demo: a static, read-only copy for the website (NEXT_PUBLIC_TEA_DEMO=1), rendered once at build
//    time from a recorded analysis of the example app. Changes made in the demo aren't saved.

export const DEMO = process.env.NEXT_PUBLIC_TEA_DEMO === '1';

/** Where the app is served from: "" locally, e.g. "/TEA/demo" on GitHub Pages. */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** A file in public/, with the base path (plain <img> and <a> tags don't get it automatically). */
export const asset = (path: string): string => `${BASE}${path}`;

/** A file from an analysis' report folder. */
export function runFile(project: string, run: string, file: string): string {
  return DEMO ? asset(`/demo-runs/${project}/${run}/${file}`) : `/api/projects/${project}/runs/${run}/files/${file}`;
}

/** How a local path is shown: the demo shows only the file name, never the build machine's folders. */
export function shownPath(path: string): string {
  return DEMO ? (path.split(/[\\/]/).pop() ?? path) : path;
}
