import { createHash, randomBytes } from 'node:crypto';
import {
  type InstallationStore,
  type InstallURLOptions,
  InvalidStateError,
  type StateStore,
} from '@slack/oauth';
import type { Db } from 'mongodb';
import { z } from 'zod';
import { encryptedTokenSchema, type TokenCipher } from './token-crypto.ts';

export const BOT_SCOPES = [
  'commands',
  'chat:write',
  'channels:history',
  'channels:read',
  'users:read',
] as const;

const slackId = z.string().regex(/^[A-Z][A-Z0-9]+$/);
const installInputSchema = z.object({
  team: z.object({ id: slackId, name: z.string().optional() }),
  enterprise: z.object({ id: slackId, name: z.string().optional() }).optional(),
  user: z.object({ id: slackId, token: z.string().optional() }),
  bot: z.object({
    id: slackId,
    userId: slackId,
    token: z.string().startsWith('xoxb-').min(6),
    scopes: z.array(z.string().min(1)),
  }),
  appId: slackId,
  isEnterpriseInstall: z.literal(false),
  authVersion: z.literal('v2'),
});

const installationDocumentSchema = z.object({
  _id: slackId,
  schemaVersion: z.literal(1),
  teamId: slackId,
  teamName: z.string().optional(),
  enterpriseId: slackId.optional(),
  enterpriseName: z.string().optional(),
  appId: slackId,
  installerUserId: slackId,
  botId: slackId,
  botUserId: slackId,
  botScopes: z.array(z.string().min(1)),
  botToken: encryptedTokenSchema.optional(),
  active: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  revokedAt: z.date().optional(),
});

const installOptionsSchema = z.object({
  scopes: z.union([z.string(), z.array(z.string())]),
  teamId: z.string().optional(),
  redirectUri: z.string().optional(),
  userScopes: z.union([z.string(), z.array(z.string())]).optional(),
  metadata: z.string().optional(),
});

const stateDocumentSchema = z.object({
  _id: z.string().length(64),
  installOptions: installOptionsSchema,
  expiresAt: z.date(),
});

function requireTeamId(teamId: string | undefined, isEnterpriseInstall: boolean): string {
  if (isEnterpriseInstall || !teamId || !slackId.safeParse(teamId).success) {
    throw new Error('A verified workspace team ID is required.');
  }
  return teamId;
}

function tokenContext(teamId: string, appId: string): string {
  return `slack-installation:v1:${appId}:${teamId}`;
}

export async function provisionOAuthIndexes(db: Db): Promise<void> {
  await db.collection('installations').createIndex({ teamId: 1 }, { unique: true });
  await db.collection('oauthStates').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

export function createInstallationStore(
  db: Db,
  appId: string,
  cipher: TokenCipher,
): InstallationStore {
  if (!slackId.safeParse(appId).success) throw new Error('SLACK_APP_ID is invalid.');
  const collection = db.collection<z.infer<typeof installationDocumentSchema>>('installations');
  return {
    async storeInstallation(installation) {
      const parsed = installInputSchema.safeParse(installation);
      if (
        !parsed.success ||
        parsed.data.appId !== appId ||
        parsed.data.user.token ||
        installation.user.refreshToken ||
        installation.bot?.refreshToken ||
        (installation.user.scopes?.length ?? 0) > 0 ||
        installation.incomingWebhook ||
        parsed.data.bot.scopes.length !== BOT_SCOPES.length ||
        BOT_SCOPES.some((scope) => !parsed.data.bot.scopes.includes(scope))
      ) {
        throw new Error('Slack returned an unsupported or unverified workspace installation.');
      }
      const value = parsed.data;
      const now = new Date();
      await collection.updateOne(
        { _id: value.team.id },
        {
          $setOnInsert: { schemaVersion: 1, teamId: value.team.id, createdAt: now },
          $set: {
            appId,
            ...(value.team.name === undefined ? {} : { teamName: value.team.name }),
            ...(value.enterprise?.id === undefined ? {} : { enterpriseId: value.enterprise.id }),
            ...(value.enterprise?.name === undefined
              ? {}
              : { enterpriseName: value.enterprise.name }),
            installerUserId: value.user.id,
            botId: value.bot.id,
            botUserId: value.bot.userId,
            botScopes: value.bot.scopes,
            botToken: cipher.encrypt(value.bot.token, tokenContext(value.team.id, appId)),
            active: true,
            updatedAt: now,
          },
          $unset: {
            revokedAt: '',
            ...(value.team.name === undefined ? { teamName: '' } : {}),
            ...(value.enterprise?.id === undefined ? { enterpriseId: '' } : {}),
            ...(value.enterprise?.name === undefined ? { enterpriseName: '' } : {}),
          },
        },
        { upsert: true },
      );
    },
    async fetchInstallation(query) {
      const teamId = requireTeamId(query.teamId, query.isEnterpriseInstall);
      const raw = await collection.findOne({ _id: teamId, active: true });
      const parsed = installationDocumentSchema.safeParse(raw);
      if (
        !parsed.success ||
        parsed.data.teamId !== teamId ||
        parsed.data.appId !== appId ||
        (query.enterpriseId && parsed.data.enterpriseId !== query.enterpriseId)
      ) {
        throw new Error('No active installation exists for this workspace.');
      }
      const record = parsed.data;
      if (!record.botToken) throw new Error('No active installation exists for this workspace.');
      return {
        team: { id: record.teamId, name: record.teamName },
        enterprise: record.enterpriseId
          ? { id: record.enterpriseId, name: record.enterpriseName }
          : undefined,
        user: { id: record.installerUserId, token: undefined, scopes: undefined },
        bot: {
          id: record.botId,
          userId: record.botUserId,
          scopes: record.botScopes,
          token: cipher.decrypt(record.botToken, tokenContext(teamId, appId)),
        },
        appId: record.appId,
        tokenType: 'bot',
        isEnterpriseInstall: false,
        authVersion: 'v2',
      };
    },
    async deleteInstallation(query) {
      const teamId = requireTeamId(query.teamId, query.isEnterpriseInstall);
      await collection.updateOne(
        { _id: teamId, appId },
        {
          $set: { active: false, revokedAt: new Date(), updatedAt: new Date() },
          $unset: { botToken: '' },
        },
      );
    },
  };
}

export async function revokeBotCredentials(
  db: Db,
  appId: string,
  teamId: string,
  revokedBotUserIds: readonly string[],
  eventTime: number,
): Promise<void> {
  if (!slackId.safeParse(teamId).success || !slackId.safeParse(appId).success) {
    throw new Error('A verified workspace and app ID are required for revocation.');
  }
  const botUserIds = revokedBotUserIds.filter((id) => slackId.safeParse(id).success);
  if (botUserIds.length === 0) return;
  const now = new Date();
  await db.collection<z.infer<typeof installationDocumentSchema>>('installations').updateOne(
    {
      _id: teamId,
      teamId,
      appId,
      botUserId: { $in: botUserIds },
      active: true,
      updatedAt: { $lte: eventCutoff(eventTime) },
    },
    { $set: { active: false, revokedAt: now, updatedAt: now }, $unset: { botToken: '' } },
  );
}

function eventCutoff(eventTime: number): Date {
  if (!Number.isSafeInteger(eventTime) || eventTime <= 0) {
    throw new Error('A valid Slack event time is required for revocation.');
  }
  return new Date((eventTime + 1) * 1000 - 1);
}

export async function revokeWorkspaceInstallation(
  db: Db,
  appId: string,
  teamId: string,
  eventTime: number,
): Promise<void> {
  if (!slackId.safeParse(teamId).success || !slackId.safeParse(appId).success) {
    throw new Error('A verified workspace and app ID are required for revocation.');
  }
  const now = new Date();
  await db
    .collection<z.infer<typeof installationDocumentSchema>>('installations')
    .updateOne(
      { _id: teamId, teamId, appId, active: true, updatedAt: { $lte: eventCutoff(eventTime) } },
      { $set: { active: false, revokedAt: now, updatedAt: now }, $unset: { botToken: '' } },
    );
}

function stateDigest(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

export function createOAuthStateStore(db: Db): StateStore {
  const collection = db.collection<z.infer<typeof stateDocumentSchema>>('oauthStates');
  return {
    async generateStateParam(installOptions: InstallURLOptions, now: Date) {
      const options = installOptionsSchema.parse(installOptions);
      const storedOptions = {
        scopes: options.scopes,
        ...(options.teamId === undefined ? {} : { teamId: options.teamId }),
        ...(options.redirectUri === undefined ? {} : { redirectUri: options.redirectUri }),
        ...(options.userScopes === undefined ? {} : { userScopes: options.userScopes }),
        ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
      };
      const state = randomBytes(32).toString('hex');
      await collection.insertOne({
        _id: stateDigest(state),
        installOptions: storedOptions,
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      });
      return state;
    },
    async verifyStateParam(now: Date, state: string) {
      if (!/^[0-9a-f]{64}$/.test(state))
        throw new InvalidStateError('Invalid or expired OAuth state.');
      const raw = await collection.findOneAndDelete({
        _id: stateDigest(state),
        expiresAt: { $gt: now },
      });
      const parsed = stateDocumentSchema.safeParse(raw);
      if (!parsed.success) throw new InvalidStateError('Invalid or expired OAuth state.');
      return parsed.data.installOptions;
    },
  };
}
