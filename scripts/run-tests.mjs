import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';

const [kind, ...options] = process.argv.slice(2);
if (!['unit', 'integration', 'slack'].includes(kind)) {
  throw new Error('Choose unit, integration, or slack tests.');
}
if (kind === 'slack' && options.join(' ') !== '--workspace sandbox') {
  throw new Error('Slack smoke tests require --workspace sandbox.');
}
if (kind !== 'slack' && options.length > 0) {
  throw new Error(`Unexpected ${kind} test options: ${options.join(' ')}`);
}

const files = globSync(`tests/${kind}/**/*.test.ts`).sort();
if (files.length === 0) {
  throw new Error(
    kind === 'slack'
      ? 'The opt-in Slack sandbox harness is supplied by C1; no smoke tests exist yet.'
      : `No ${kind} tests found.`,
  );
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
