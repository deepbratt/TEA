// Public API of the tea-qa package: the plugin and catalog API for plugin authors, the run()
// entry point, and the workspace service the TEA Workbench (web/) is built on.
export * from './core/index.js';
export { scanRepo, scanSources, sourceFromPath, BUILTIN_PLUGINS, SOURCE_ROLES, type ScanResult, type SourceFolder, type SourceRole } from './repo-map/index.js';
export { crawl, crawlFindings } from './scanner/index.js';
export { wiringFindings } from './wiring/index.js';
export { writeReport, renderHtml, renderMarkdown, AREA_LABEL } from './report/index.js';
export { run, resolveTarget, VERSION, type RunOptions, type RunOutcome } from './cli/run.js';
export * from './workspace/index.js';
