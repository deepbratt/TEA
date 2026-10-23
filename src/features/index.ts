export * from './types.js';
export { buildCodeIndex, isDocFile, stripComments, type CodeIndex } from './code.js';
export { parseClaims } from './docs.js';
export { matchClaim, claimPaths, type MatchContext } from './claims.js';
export { buildInventory, featureKey } from './inventory.js';
export { claimFindings } from './findings.js';
export { evaluateFeatures } from './evaluate.js';
export { sandboxTests, assertSandboxAllowed, SandboxError, type SandboxResult } from './sandbox.js';
export { renderFeaturesMarkdown, featureLine, STATUS_LABEL, STATUS_ICON } from './render.js';
