import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Router, raw } from 'express';
import type { Db } from 'mongodb';

export function createSlackIngressRouter(db: Db, signingSecret: string): Router {
  const router = Router();
  router.post(
    '/slack/events',
    raw({ type: '*/*', limit: '1mb' }),
    async (request, response, next) => {
      try {
        if (!Buffer.isBuffer(request.body)) throw new Error('Slack request body is unavailable.');
        await verifySignedSlackRequest({
          rawBody: request.body,
          timestamp: request.header('x-slack-request-timestamp'),
          signature: request.header('x-slack-signature'),
          signingSecret,
          db,
        });
        Object.assign(request, { rawBody: request.body });
        next();
      } catch (error) {
        response.sendStatus(
          error instanceof Error && /Slack request/.test(error.message) ? 401 : 503,
        );
      }
    },
  );
  return router;
}

export async function verifySignedSlackRequest(options: {
  rawBody: Buffer;
  timestamp: string | undefined;
  signature: string | undefined;
  signingSecret: string;
  db: Db;
  now?: Date;
}): Promise<void> {
  const { rawBody, timestamp, signature, signingSecret, db } = options;
  const now = options.now ?? new Date();
  if (
    !timestamp ||
    !signature ||
    !/^\d{10}$/.test(timestamp) ||
    !/^v0=[0-9a-f]{64}$/.test(signature)
  ) {
    throw new Error('Invalid Slack request signature.');
  }
  const seconds = Number(timestamp);
  if (Math.abs(Math.floor(now.getTime() / 1000) - seconds) > 300) {
    throw new Error('Stale Slack request.');
  }
  const expected = createHmac('sha256', signingSecret)
    .update(`v0:${timestamp}:`)
    .update(rawBody)
    .digest();
  const actual = Buffer.from(signature.slice(3), 'hex');
  if (!timingSafeEqual(actual, expected)) throw new Error('Invalid Slack request signature.');
  const digest = createHash('sha256').update(signature).digest('hex');
  try {
    await db.collection<{ _id: string; expiresAt: Date }>('slackRequestReceipts').insertOne({
      _id: digest,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      throw new Error('Replayed Slack request.');
    }
    throw error;
  }
}

export async function provisionSlackRequestIndexes(db: Db): Promise<void> {
  await db
    .collection('slackRequestReceipts')
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}
