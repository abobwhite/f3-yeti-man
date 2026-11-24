import { spawnSync } from 'node:child_process';

for (const script of [
  'typecheck',
  'lint',
  'build',
  'test:unit',
  'test:coverage',
  'test:integration',
]) {
  const result = spawnSync('npm', ['run', script], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
