import { existsSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadCatalog, catalogFromEnv, log, masker } from '../core/index.js';
import { scanSources, type SourceFolder } from '../repo-map/index.js';
import { STATUS_ICON, STATUS_LABEL, buildCodeIndex, buildInventory, claimFindings, evaluateFeatures, featureLine, renderFeaturesMarkdown } from '../features/index.js';
import { wiringFindings } from '../wiring/index.js';
import { UsageError } from './run.js';

/**
 * `tea-qa features`: step 1 of feature QA on its own. Reads the code and the docs, lists every
 * feature with its test plan, and writes features.md. Opens nothing, runs nothing.
 */
export async function listFeatures(o: { sources: SourceFolder[]; out: string }): Promise<void> {
  for (const src of o.sources) {
    if (!existsSync(src.path) || !statSync(src.path).isDirectory()) throw new UsageError(`Folder not found: ${src.path}`);
  }
  log.step(`Reading ${o.sources.map((s) => s.path).join(', ')}`);
  const catalog = await loadCatalog(catalogFromEnv());
  const scan = await scanSources(o.sources);
  const index = await buildCodeIndex(o.sources);
  const inventory = buildInventory({ discovery: scan, wiring: scan.wiring, index });
  const findings = [...claimFindings(inventory, catalog), ...wiringFindings(scan.wiring, catalog)];
  const report = evaluateFeatures(inventory, { findings, pages: [], live: false, wiring: scan.wiring.comparable, docs: [...index.docs.keys()] });

  const out = resolve(o.out);
  await mkdir(out, { recursive: true });
  const md = masker.mask(renderFeaturesMarkdown(report));
  await writeFile(join(out, 'features.md'), `${md}\n`);
  await writeFile(join(out, 'features.json'), `${JSON.stringify(masker.maskDeep(report), null, 2)}\n`);

  log.result(`\n${featureLine(report)}.`);
  for (const f of report.features) {
    const plan = f.checks.length;
    log.result(`  ${STATUS_ICON[f.status]} ${f.name}${f.status === 'untested' ? '' : `: ${STATUS_LABEL[f.status]}`}  (${plan} check${plan === 1 ? '' : 's'} planned)`);
  }
  log.result(`\nThe full list and every feature's test plan: ${join(out, 'features.md')}`);
  log.result('Run `tea-qa run` with your app\'s URL to test them, and add --sandbox (local apps) to submit forms with test data.');
}
