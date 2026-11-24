import { randomUUID } from 'node:crypto';
import {
  connectDatabase,
  type DatabaseConnection,
  type DatabaseMode,
  startMemoryReplicaSet,
} from '../../src/modules/workspace-foundation/database.ts';

const DOCKER_URI = 'mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true';

export function assertLocalTestTarget(
  environment: Readonly<Record<string, string | undefined>>,
): void {
  if (environment.NODE_ENV === 'production')
    throw new Error('Integration tests cannot run in production mode.');
  if (environment.MONGODB_DATABASE)
    throw new Error('Integration tests always generate an isolated database name.');
  if (!environment.MONGODB_URI) return;

  const parsed = new URL(environment.MONGODB_URI);
  if (
    parsed.protocol !== 'mongodb:' ||
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== '/' && parsed.pathname !== '')
  ) {
    throw new Error(
      'Integration MongoDB URI must target a local server with no database or credentials.',
    );
  }
}

export async function openIntegrationDatabase(environment = process.env): Promise<{
  mode: DatabaseMode;
  uri: string;
  connection: DatabaseConnection;
  close(): Promise<void>;
}> {
  assertLocalTestTarget(environment);
  const mode = environment.TEST_DB_MODE ?? 'memory';
  if (mode !== 'memory' && mode !== 'docker') {
    throw new Error('TEST_DB_MODE must be memory or docker.');
  }

  const replicaSet = mode === 'memory' ? await startMemoryReplicaSet() : undefined;
  const uri = replicaSet?.uri ?? environment.MONGODB_URI ?? DOCKER_URI;
  const databaseName = `f3_yeti_test_${randomUUID().replaceAll('-', '')}`;
  try {
    const connection = await connectDatabase({ mode, uri, databaseName, production: false });
    let closed = false;
    return {
      mode,
      uri,
      connection,
      async close() {
        if (closed) return;
        closed = true;
        try {
          await connection.db.dropDatabase();
        } finally {
          try {
            await connection.close();
          } finally {
            await replicaSet?.stop();
          }
        }
      },
    };
  } catch (error) {
    await replicaSet?.stop();
    throw error;
  }
}
