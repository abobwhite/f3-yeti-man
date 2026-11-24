import { type Db, MongoClient } from 'mongodb';

export const MONGOD_VERSION = '8.0.30';

export type DatabaseMode = 'memory' | 'docker' | 'external';

export interface DatabaseConnection {
  client: MongoClient;
  db: Db;
  close(): Promise<void>;
  isClosed(): boolean;
}

export function databaseMode(value: string | undefined): DatabaseMode {
  if (value === undefined || value === 'external') return 'external';
  if (value === 'memory' || value === 'docker') return value;
  throw new Error('DEV_DB_MODE must be memory, docker, or external.');
}

export function requireProductionDatabase(
  environment: Readonly<Record<string, string | undefined>>,
): void {
  if (
    environment.NODE_ENV === 'production' &&
    (!environment.MONGODB_URI || !environment.MONGODB_DATABASE)
  ) {
    throw new Error('Production requires MONGODB_URI and MONGODB_DATABASE.');
  }
}

export async function startMemoryReplicaSet(): Promise<{ uri: string; stop(): Promise<void> }> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Production cannot start an ephemeral MongoDB replica set.');
  }
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const replicaSet = await MongoMemoryReplSet.create({
    binary: { version: MONGOD_VERSION },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  return {
    uri: replicaSet.getUri(),
    stop: async () => {
      await replicaSet.stop();
    },
  };
}

export async function connectDatabase(options: {
  mode: DatabaseMode;
  uri: string;
  databaseName: string;
  production?: boolean;
}): Promise<DatabaseConnection> {
  if (
    (options.production ?? process.env.NODE_ENV === 'production') &&
    options.mode !== 'external'
  ) {
    throw new Error('Production requires an external MongoDB deployment.');
  }
  if (!options.uri || !/^[a-z][a-z0-9_-]{0,62}$/i.test(options.databaseName)) {
    throw new Error('A MongoDB URI and safe database name are required.');
  }

  const client = new MongoClient(options.uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db(options.databaseName);
    await db.command({ ping: 1 });
    let closed = false;
    return {
      client,
      db,
      async close() {
        if (closed) return;
        await client.close();
        closed = true;
      },
      isClosed: () => closed,
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}
