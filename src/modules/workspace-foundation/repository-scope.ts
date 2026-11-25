import type { Document, Filter } from 'mongodb';
import { assertWorkspaceContext, type WorkspaceContext } from './context.ts';

export function createTenantScope(
  context: WorkspaceContext,
  assertActive: (context: WorkspaceContext) => Promise<unknown>,
) {
  assertWorkspaceContext(context);
  const tenant = Object.freeze({ teamId: context.teamId, regionId: context.regionId });
  return {
    async filter<T extends Document>(criteria: Filter<T> = {}): Promise<Filter<T>> {
      await assertActive(context);
      return { $and: [tenant, criteria] } as Filter<T>;
    },
    async pipeline(stages: Document[]): Promise<Document[]> {
      await assertActive(context);
      const allowed = new Set([
        '$match',
        '$project',
        '$group',
        '$sort',
        '$skip',
        '$limit',
        '$count',
        '$unwind',
      ]);
      if (
        stages.some(
          (stage) => Object.keys(stage).length !== 1 || !allowed.has(Object.keys(stage)[0] ?? ''),
        )
      ) {
        throw new Error('Tenant aggregation stage is unsupported.');
      }
      return [{ $match: tenant }, ...stages];
    },
    async cacheKey(key: string): Promise<string> {
      await assertActive(context);
      return JSON.stringify([tenant.teamId, tenant.regionId, key]);
    },
    async tenantFields() {
      await assertActive(context);
      return tenant;
    },
  };
}
