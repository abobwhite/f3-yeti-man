import { randomUUID } from 'node:crypto';
import type { ClientSession, Db } from 'mongodb';
import { z } from 'zod';
import { scoringBandSchema, validateScoringBands } from '../../shared/scoring-bands.ts';
import { type ChannelClient, requirePublicLocalDestination } from './channels.ts';
import { assertWorkspaceContext, type WorkspaceContext } from './context.ts';

const slackId = z.string().regex(/^[A-Z][A-Z0-9]+$/);
const slot = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const scheduleSchema = z.partialRecord(
  z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']),
  z.array(slot).min(1),
);
const aoSchema = z.object({
  aoId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  channelId: slackId,
  schedule: scheduleSchema,
  active: z.boolean(),
});
export const setupInputSchema = z.object({
  regionName: z.string().trim().min(1).max(100),
  timezone: z.string().min(1),
  aos: z.array(aoSchema).min(1).max(100),
  scoringBands: z.array(scoringBandSchema).min(1),
  automaticBackblastRepliesEnabled: z.boolean(),
  trustedF3BotUserId: slackId.optional(),
});
export type SetupInput = z.infer<typeof setupInputSchema>;

const configurationSchema = setupInputSchema.extend({
  _id: slackId,
  teamId: slackId,
  regionId: z.string().uuid(),
  revision: z.number().int().positive(),
  scoringPolicyId: z.string().uuid(),
  scoringPolicyRevision: z.number().int().positive(),
  confirmedBy: slackId,
  confirmedAt: z.date(),
  fence: z.number().int().nonnegative(),
});
export type ReadyConfiguration = z.infer<typeof configurationSchema>;

type AdminBoundary = {
  assertActive(context: WorkspaceContext, session?: ClientSession): Promise<unknown>;
  requireAdmin(context: WorkspaceContext, session?: ClientSession): Promise<void>;
  withAdminCommit<T>(
    context: WorkspaceContext,
    action: (session: ClientSession) => Promise<T>,
  ): Promise<T>;
};

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function validateSetup(input: unknown): SetupInput {
  const value = setupInputSchema.parse(input);
  if (!validTimezone(value.timezone)) throw new Error('REGION_TIMEZONE_INVALID');
  if (!value.aos.some((ao) => ao.active)) throw new Error('ACTIVE_AO_REQUIRED');
  if (
    new Set(value.aos.map((ao) => ao.aoId)).size !== value.aos.length ||
    new Set(value.aos.map((ao) => ao.channelId)).size !== value.aos.length
  ) {
    throw new Error('DUPLICATE_AO_OR_CHANNEL');
  }
  for (const ao of value.aos) {
    const times = Object.values(ao.schedule).flatMap((slots) => slots ?? []);
    if (ao.active && times.length === 0) throw new Error('AO_SCHEDULE_REQUIRED');
    for (const slots of Object.values(ao.schedule)) {
      if (slots && new Set(slots).size !== slots.length)
        throw new Error('DUPLICATE_AO_SCHEDULE_SLOT');
    }
  }
  validateScoringBands(value.scoringBands);
  if (value.automaticBackblastRepliesEnabled && !value.trustedF3BotUserId) {
    throw new Error('TRUSTED_F3_BOT_REQUIRED');
  }
  return value;
}

export async function provisionConfigurationIndexes(db: Db): Promise<void> {
  await db
    .collection('regionConfigurations')
    .createIndexes([{ key: { teamId: 1, regionId: 1 }, unique: true }]);
  await db
    .collection('scoringPolicies')
    .createIndexes([{ key: { teamId: 1, regionId: 1, revision: 1 }, unique: true }]);
}

export function createConfigurationProvider(db: Db, admin: AdminBoundary, now = () => new Date()) {
  const configs = db.collection<ReadyConfiguration>('regionConfigurations');
  const policies = db.collection<{
    _id: string;
    teamId: string;
    regionId: string;
    revision: number;
    bands: SetupInput['scoringBands'];
    confirmedBy: string;
    confirmedAt: Date;
  }>('scoringPolicies');
  let seasonCheck:
    | ((context: WorkspaceContext, session?: ClientSession) => Promise<boolean>)
    | undefined;

  async function rawConfiguration(context: WorkspaceContext, session?: ClientSession) {
    assertWorkspaceContext(context);
    await admin.assertActive(context, session);
    const raw = await configs.findOne(
      { _id: context.teamId, teamId: context.teamId, regionId: context.regionId },
      { session },
    );
    return configurationSchema.safeParse(raw).data;
  }

  async function status(context: WorkspaceContext, session?: ClientSession) {
    const config = await rawConfiguration(context, session);
    const missingSettings: string[] = [];
    if (!config) {
      missingSettings.push(
        'Region name and timezone',
        'At least one AO and its workout-day/start-time defaults',
        'Scoring bands',
        'Automatic Backblast replies review',
      );
    } else {
      if (!config.regionName.trim() || !validTimezone(config.timezone))
        missingSettings.push('Region name and timezone');
      if (
        !config.aos.some(
          (ao) => ao.active && Object.values(ao.schedule).some((slots) => (slots?.length ?? 0) > 0),
        )
      )
        missingSettings.push('At least one AO and its workout-day/start-time defaults');
      try {
        validateScoringBands(config.scoringBands);
      } catch {
        missingSettings.push('Scoring bands');
      }
      if (config.automaticBackblastRepliesEnabled && !config.trustedF3BotUserId)
        missingSettings.push('Verified F3 app/bot identity');
    }
    if (!seasonCheck || !(await seasonCheck(context, session)))
      missingSettings.push('Competition start/end dates');
    return {
      ready: missingSettings.length === 0,
      missingSettings,
      configurationRevision: config?.revision,
    };
  }

  return {
    registerSetupCheck(
      check: (context: WorkspaceContext, session?: ClientSession) => Promise<boolean>,
    ) {
      if (seasonCheck) throw new Error('Season setup check already registered.');
      seasonCheck = check;
    },
    getSuggestedSetup(): SetupInput {
      return {
        regionName: '',
        timezone: 'America/New_York',
        aos: [
          {
            aoId: randomUUID(),
            name: '',
            channelId: 'C00000000',
            active: true,
            schedule: { mon: ['05:30'], wed: ['05:30'], fri: ['05:30'] },
          },
        ],
        scoringBands: [
          { minF: -40, maxF: 0, points: 5 },
          { minF: 1, maxF: 10, points: 4 },
          { minF: 11, maxF: 18, points: 3 },
          { minF: 19, maxF: 25, points: 2 },
          { minF: 26, maxF: 32, points: 1 },
          { minF: 33, maxF: 120, points: 0 },
        ],
        automaticBackblastRepliesEnabled: true,
      };
    },
    rawConfiguration,
    getSetupStatus: status,
    async assertConfigured(
      context: WorkspaceContext,
      expectedRevision?: number,
      session?: ClientSession,
    ): Promise<ReadyConfiguration> {
      const result = await status(context, session);
      if (!result.ready) throw new Error(`SETUP_REQUIRED:${result.missingSettings.join('|')}`);
      if (expectedRevision !== undefined && expectedRevision !== result.configurationRevision)
        throw new Error('CONFIGURATION_REVISION_CONFLICT');
      if (session) {
        const update = await configs.updateOne(
          {
            _id: context.teamId,
            teamId: context.teamId,
            regionId: context.regionId,
            revision: result.configurationRevision,
          },
          { $inc: { fence: 1 } },
          { session },
        );
        if (update.matchedCount !== 1) throw new Error('CONFIGURATION_REVISION_CONFLICT');
      }
      const config = await rawConfiguration(context, session);
      if (!config) throw new Error('SETUP_REQUIRED');
      return config;
    },
    async confirmInitialSetup(
      context: WorkspaceContext,
      input: unknown,
      client: ChannelClient,
      expectedRevision?: number,
    ) {
      assertWorkspaceContext(context);
      await admin.requireAdmin(context);
      const value = validateSetup(input);
      for (const ao of value.aos.filter((item) => item.active)) {
        const channel = await requirePublicLocalDestination(
          context,
          ao.channelId,
          context.actorUserId,
          client,
          admin.assertActive,
        );
        if (!channel.name.startsWith('ao-')) throw new Error('AO_CHANNEL_NAME_REQUIRED');
      }
      if (value.automaticBackblastRepliesEnabled && value.trustedF3BotUserId) {
        const bot = await client.users.info({ user: value.trustedF3BotUserId });
        if (
          !bot.ok ||
          bot.user?.id !== value.trustedF3BotUserId ||
          bot.user.team_id !== context.teamId ||
          (bot.user.is_bot !== true && bot.user.is_app_user !== true) ||
          bot.user.deleted === true
        ) {
          throw new Error('TRUSTED_F3_BOT_INVALID');
        }
      }
      return admin.withAdminCommit(context, async (session) => {
        const prior = await rawConfiguration(context, session);
        if (prior && (await status(context, session)).ready)
          throw new Error('INITIAL_SETUP_ALREADY_CONFIRMED');
        if (prior && prior.revision !== expectedRevision)
          throw new Error('CONFIGURATION_REVISION_CONFLICT');
        if (!prior && expectedRevision !== undefined)
          throw new Error('CONFIGURATION_REVISION_CONFLICT');
        const timestamp = now();
        const policyId = randomUUID();
        const revision = (prior?.revision ?? 0) + 1;
        const next = configurationSchema.parse({
          ...value,
          _id: context.teamId,
          teamId: context.teamId,
          regionId: context.regionId,
          revision,
          scoringPolicyId: policyId,
          scoringPolicyRevision: revision,
          confirmedBy: context.actorUserId,
          confirmedAt: timestamp,
          fence: 0,
        });
        await policies.insertOne(
          {
            _id: policyId,
            teamId: context.teamId,
            regionId: context.regionId,
            revision,
            bands: value.scoringBands,
            confirmedBy: context.actorUserId,
            confirmedAt: timestamp,
          },
          { session },
        );
        await configs.replaceOne(
          {
            _id: context.teamId,
            teamId: context.teamId,
            regionId: context.regionId,
            ...(prior ? { revision: prior.revision } : {}),
          },
          next,
          { upsert: !prior, session },
        );
        return next;
      });
    },
  };
}
