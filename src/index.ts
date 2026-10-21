// Public API of the tea-qa package: the plugin and catalog API for plugin authors, and the
// run() entry point used by the CLI and the local UI.
export * from './core/index.js';
export { scanRepo, BUILTIN_PLUGINS, type ScanResult } from './repo-map/index.js';
export { crawl, crawlFindings } from './scanner/index.js';
export { writeReport, renderHtml, renderMarkdown } from './report/index.js';
export { run, resolveTarget, VERSION, type RunOptions, type RunOutcome } from './cli/run.js';
export { startUi, type UiServer, type UiOptions } from './ui/server.js';
