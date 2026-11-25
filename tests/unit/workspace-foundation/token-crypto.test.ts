import assert from 'node:assert/strict';
import test from 'node:test';
import { createTokenCipher } from '../../../src/modules/workspace-foundation/token-crypto.ts';

const firstKey = Buffer.alloc(32, 1).toString('base64');
const secondKey = Buffer.alloc(32, 2).toString('base64');

test('token encryption authenticates the workspace context and supports key rotation', () => {
  const oldCipher = createTokenCipher(JSON.stringify({ current: 'old', keys: { old: firstKey } }));
  const encrypted = oldCipher.encrypt('xoxb-secret-one', 'AAPP1:TONE');
  assert.equal(encrypted.keyId, 'old');
  assert.equal(oldCipher.decrypt(encrypted, 'AAPP1:TONE'), 'xoxb-secret-one');
  assert.notEqual(JSON.stringify(encrypted).includes('xoxb-secret-one'), true);
  assert.throws(() => oldCipher.decrypt(encrypted, 'AAPP1:TTWO'), /cannot be decrypted/);
  assert.throws(
    () => oldCipher.decrypt({ ...encrypted, ciphertext: 'AAAA' }, 'AAPP1:TONE'),
    /cannot be decrypted/,
  );

  const rotatedCipher = createTokenCipher(
    JSON.stringify({ current: 'new', keys: { old: firstKey, new: secondKey } }),
  );
  assert.equal(rotatedCipher.decrypt(encrypted, 'AAPP1:TONE'), 'xoxb-secret-one');
  assert.equal(rotatedCipher.encrypt('xoxb-secret-two', 'AAPP1:TONE').keyId, 'new');
});

test('token encryption rejects unusable key rings and empty context', () => {
  assert.throws(() => createTokenCipher('not json'), /valid JSON/);
  assert.throws(() => createTokenCipher('{}'), /invalid key ring/);
  assert.throws(
    () => createTokenCipher(JSON.stringify({ current: 'missing', keys: { old: firstKey } })),
    /current token encryption key/,
  );
  assert.throws(
    () => createTokenCipher(JSON.stringify({ current: 'bad', keys: { bad: 'short' } })),
    /32-byte/,
  );
  const cipher = createTokenCipher(JSON.stringify({ current: 'old', keys: { old: firstKey } }));
  assert.throws(() => cipher.encrypt('', 'context'), /required/);
  assert.throws(() => cipher.encrypt('token', ''), /required/);
});
