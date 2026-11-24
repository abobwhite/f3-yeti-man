import { spawnSync } from 'node:child_process';
import { globSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { relative } from 'node:path';

const files = ['unit', 'integration']
  .flatMap((kind) => globSync(`tests/${kind}/**/*.test.ts`))
  .sort();
if (files.length === 0) throw new Error('Coverage needs at least one test.');

mkdirSync('.coverage', { recursive: true });
const report = '.coverage/lcov.info';
rmSync(report, { force: true });
const result = spawnSync(
  process.execPath,
  [
    '--test',
    '--test-concurrency=1',
    '--experimental-test-coverage',
    '--test-coverage-include=src/**/*.ts',
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    '--test-reporter=lcov',
    `--test-reporter-destination=${report}`,
    ...files,
  ],
  { stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status ?? 1);

const sourceFiles = globSync('src/**/*.ts')
  .filter((file) => !file.endsWith('.d.ts'))
  .sort();
const lcov = readFileSync(report, 'utf8');
const coveredFiles = new Set(
  [...lcov.matchAll(/^SF:(.+)$/gm)].map((match) => relative('.', match[1])),
);
const missing = sourceFiles.filter((file) => !coveredFiles.has(file));
if (missing.length > 0) {
  throw new Error(`Source files absent from coverage: ${missing.join(', ')}`);
}

const totals = { LF: 0, LH: 0, BRF: 0, BRH: 0 };
for (const [, key, count] of lcov.matchAll(/^(LF|LH|BRF|BRH):(\d+)$/gm)) {
  totals[key] += Number(count);
}
const lines = (100 * totals.LH) / totals.LF;
const branches = (100 * totals.BRH) / totals.BRF;
if (!Number.isFinite(lines) || !Number.isFinite(branches) || lines < 90 || branches < 85) {
  throw new Error(
    `Coverage below 90% lines / 85% branches: ${lines.toFixed(2)}% / ${branches.toFixed(2)}%.`,
  );
}
console.log(`Coverage gate passed: ${lines.toFixed(2)}% lines, ${branches.toFixed(2)}% branches.`);

for (const [label, pattern] of [
  ['scoring', 'tests/{unit,integration}/entry-ledger/**/*scor*.test.ts'],
  [
    'security',
    'tests/{unit,integration}/workspace-foundation/**/*{security,authoriz,tenant}*.test.ts',
  ],
  ['locks', 'tests/{unit,integration}/entry-ledger/**/*lock*.test.ts'],
]) {
  if (globSync(pattern).length === 0) console.log(`Invariant suite pending: ${label}.`);
}
