import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';

const approvedModules = new Set([
  'workspace-foundation',
  'entry-ledger',
  'entry-capture',
  'f3-ingestion',
  'reporting',
]);
const [moduleId, ...extra] = process.argv.slice(2);
if (!approvedModules.has(moduleId) || extra.length > 0) {
  throw new Error(`Pass exactly one approved module ID: ${[...approvedModules].join(', ')}.`);
}

const files = ['unit', 'integration']
  .flatMap((kind) => globSync(`tests/${kind}/${moduleId}/**/*.test.ts`))
  .sort();
if (files.length === 0) throw new Error(`No tests found for ${moduleId}.`);

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
