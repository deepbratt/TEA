import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { masker, type AppMap, type Results } from '../core/index.js';
import { renderHtml } from './html.js';
import { renderFeatureMap, renderMarkdown } from './markdown.js';
import { renderFeaturesMarkdown } from '../features/render.js';

export { renderHtml } from './html.js';
export { renderMarkdown } from './markdown.js';
export { plainSummary, topFindings, AREA_LABEL } from './summary.js';

export interface WrittenReport {
  dir: string;
  files: string[];
}

/** Write every report artifact. Everything is secret-masked on the way out. */
export async function writeReport(outDir: string, results: Results, appMap: AppMap): Promise<WrittenReport> {
  await mkdir(outDir, { recursive: true });
  const r = masker.maskDeep(results);
  const m = masker.maskDeep(appMap);
  const files: [string, string][] = [
    ['results.json', JSON.stringify(r, null, 2)],
    ['app-map.json', JSON.stringify(m, null, 2)],
    ['feature-map.md', renderFeatureMap(m)],
    ['report.md', renderMarkdown(r, m)],
    ['report.html', renderHtml(r, m)],
  ];
  if (r.features) files.push(['features.md', renderFeaturesMarkdown(r.features)], ['features.json', JSON.stringify(r.features, null, 2)]);
  for (const [name, content] of files) await writeFile(join(outDir, name), content + '\n');
  return { dir: outDir, files: files.map(([n]) => n) };
}
