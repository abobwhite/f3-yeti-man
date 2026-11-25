import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';

const keyIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/);

export const encryptedTokenSchema = z.strictObject({
  keyId: keyIdSchema,
  iv: z.string(),
  tag: z.string(),
  ciphertext: z.string(),
});

export type EncryptedToken = z.infer<typeof encryptedTokenSchema>;

export interface TokenCipher {
  encrypt(token: string, context: string): EncryptedToken;
  decrypt(encrypted: EncryptedToken, context: string): string;
}

function decodeKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) {
    throw new Error('Each token encryption key must be a base64-encoded 32-byte value.');
  }
  return key;
}

export function createTokenCipher(keyRingJson: string): TokenCipher {
  let parsed: unknown;
  try {
    parsed = JSON.parse(keyRingJson);
  } catch {
    throw new Error('TOKEN_ENCRYPTION_KEYS_JSON must be valid JSON.');
  }
  const ring = z
    .strictObject({
      current: keyIdSchema,
      keys: z.record(keyIdSchema, z.string()),
    })
    .safeParse(parsed);
  if (!ring.success) throw new Error('TOKEN_ENCRYPTION_KEYS_JSON has an invalid key ring.');
  const keys = new Map(Object.entries(ring.data.keys).map(([id, value]) => [id, decodeKey(value)]));
  const currentKey = keys.get(ring.data.current);
  if (!currentKey) throw new Error('The current token encryption key is missing.');

  return {
    encrypt(token, context) {
      if (!token || !context) throw new Error('Token and encryption context are required.');
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', currentKey, iv);
      cipher.setAAD(Buffer.from(context));
      const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
      return {
        keyId: ring.data.current,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      };
    },
    decrypt(encrypted, context) {
      const value = encryptedTokenSchema.parse(encrypted);
      const key = keys.get(value.keyId);
      if (!key || !context) throw new Error('The installation token cannot be decrypted.');
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
        decipher.setAAD(Buffer.from(context));
        decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
        return Buffer.concat([
          decipher.update(Buffer.from(value.ciphertext, 'base64')),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        throw new Error('The installation token cannot be decrypted.');
      }
    },
  };
}
