import type { Executor } from '../database/db';

export interface ActivityInput {
  actorId?: string | null;
  action: string; // e.g. auth.login, user.status_changed, payment.verified
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/** Append-only audit trail. Pass a transaction so the log commits atomically with the action. */
export async function logActivity(executor: Executor, input: ActivityInput): Promise<void> {
  await executor.query(
    `INSERT INTO activity_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::inet)`,
    [
      input.actorId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.ip ?? null,
    ],
  );
}
