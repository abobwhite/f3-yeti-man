import assert from 'node:assert/strict';
import test from 'node:test';
import {
  connectDatabase,
  databaseMode,
  requireProductionDatabase,
  startMemoryReplicaSet,
} from '../../../src/modules/workspace-foundation/database.ts';
import { assertLocalTestTarget } from '../../integration/database-harness.ts';

test('database mode accepts only supported values', () => {
  assert.equal(databaseMode(undefined), 'external');
  assert.equal(databaseMode('external'), 'external');
  assert.equal(databaseMode('memory'), 'memory');
  assert.equal(databaseMode('docker'), 'docker');
  assert.throws(() => databaseMode('unexpected'), /DEV_DB_MODE/);
});

test('integration database target rejects production and remote settings', () => {
  assert.doesNotThrow(() => assertLocalTestTarget({}));
  assert.doesNotThrow(() =>
    assertLocalTestTarget({ MONGODB_URI: 'mongodb://127.0.0.1:27017/?replicaSet=rs0' }),
  );
  for (const environment of [
    { NODE_ENV: 'production' },
    { MONGODB_DATABASE: 'production' },
    { MONGODB_URI: 'mongodb+srv://cluster.example.com/' },
    { MONGODB_URI: 'mongodb://db.example.com/' },
    { MONGODB_URI: 'mongodb://user:password@localhost/' },
    { MONGODB_URI: 'mongodb://localhost/production' },
  ]) {
    assert.throws(() => assertLocalTestTarget(environment));
  }
});

test('production and invalid connection settings fail before connecting', async () => {
  assert.doesNotThrow(() => requireProductionDatabase({}));
  assert.throws(() => requireProductionDatabase({ NODE_ENV: 'production' }), /MONGODB_URI/);
  assert.throws(
    () => requireProductionDatabase({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://localhost' }),
    /MONGODB_DATABASE/,
  );
  assert.doesNotThrow(() =>
    requireProductionDatabase({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://localhost',
      MONGODB_DATABASE: 'prod',
    }),
  );
  await assert.rejects(
    connectDatabase({
      mode: 'memory',
      uri: 'mongodb://localhost',
      databaseName: 'test',
      production: true,
    }),
    /external MongoDB/,
  );
  await assert.rejects(
    connectDatabase({
      mode: 'docker',
      uri: 'mongodb://localhost',
      databaseName: 'test',
      production: true,
    }),
    /external MongoDB/,
  );
  await assert.rejects(
    connectDatabase({ mode: 'external', uri: '', databaseName: 'test', production: false }),
    /URI and safe database name/,
  );
  await assert.rejects(
    connectDatabase({
      mode: 'external',
      uri: 'mongodb://localhost',
      databaseName: '../unsafe',
      production: false,
    }),
    /URI and safe database name/,
  );
});

test('production cannot launch a memory replica set', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(startMemoryReplicaSet(), /Production cannot start/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
