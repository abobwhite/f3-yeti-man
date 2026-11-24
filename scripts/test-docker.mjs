import { spawnSync } from 'node:child_process';

const up = spawnSync('docker', ['compose', 'up', '-d', '--wait', 'mongo'], { stdio: 'inherit' });
if (up.status !== 0) process.exit(up.status ?? 1);

try {
  const tests = spawnSync(process.execPath, ['scripts/run-tests.mjs', 'integration'], {
    env: { ...process.env, TEST_DB_MODE: 'docker' },
    stdio: 'inherit',
  });
  process.exitCode = tests.status ?? 1;
} finally {
  const down = spawnSync('docker', ['compose', 'down'], { stdio: 'inherit' });
  if (down.status !== 0) process.exitCode = down.status ?? 1;
}
