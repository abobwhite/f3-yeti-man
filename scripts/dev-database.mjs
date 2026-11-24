import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { startMemoryReplicaSet } from '../src/modules/workspace-foundation/database.ts';

const mode = process.argv[2];
if (mode !== 'memory' && mode !== 'docker')
  throw new Error('Choose memory or docker development mode.');

let replicaSet;
if (mode === 'memory') {
  replicaSet = await startMemoryReplicaSet();
} else {
  const up = spawnSync('docker', ['compose', 'up', '-d', '--wait', 'mongo'], { stdio: 'inherit' });
  if (up.status !== 0) process.exit(up.status ?? 1);
}

const uri = replicaSet?.uri ?? 'mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true';
const child = spawn(process.execPath, ['--watch', 'src/app.ts'], {
  env: {
    ...process.env,
    DEV_DB_MODE: mode,
    MONGODB_URI: uri,
    MONGODB_DATABASE: process.env.MONGODB_DATABASE || 'f3_yeti_dev',
  },
  stdio: 'inherit',
});
process.once('SIGINT', () => child.kill('SIGINT'));
process.once('SIGTERM', () => child.kill('SIGTERM'));

const [code] = await once(child, 'exit');
if (replicaSet) await replicaSet.stop();
else {
  const down = spawnSync('docker', ['compose', 'down'], { stdio: 'inherit' });
  if (down.status !== 0) process.exitCode = down.status ?? 1;
}
process.exitCode ||= code ?? 1;
