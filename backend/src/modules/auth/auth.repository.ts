import type { Executor } from '../../database/db';

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

export interface PasswordResetRow {
  id: string;
  user_id: string;
  expires_at: Date;
  used_at: Date | null;
}

export const authRepository = {
  async insertRefreshToken(
    db: Executor,
    input: { userId: string; tokenHash: string; familyId: string | null; expiresAt: Date; userAgent?: string; ip?: string },
  ): Promise<{ id: string; familyId: string }> {
    const { rows } = await db.query<{ id: string; family_id: string }>(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent, ip_address)
       VALUES ($1, $2, COALESCE($3::uuid, gen_random_uuid()), $4, $5, $6::inet)
       RETURNING id, family_id`,
      [input.userId, input.tokenHash, input.familyId, input.expiresAt, input.userAgent?.slice(0, 300) ?? null, input.ip ?? null],
    );
    return { id: rows[0]!.id, familyId: rows[0]!.family_id };
  },

  async findRefreshByHash(db: Executor, tokenHash: string, lock = false): Promise<RefreshTokenRow | null> {
    const { rows } = await db.query<RefreshTokenRow>(
      `SELECT id, user_id, token_hash, family_id, expires_at, revoked_at FROM refresh_tokens
       WHERE token_hash = $1 ${lock ? 'FOR UPDATE' : ''}`,
      [tokenHash],
    );
    return rows[0] ?? null;
  },

  async markRotated(db: Executor, oldId: string, newId: string): Promise<void> {
    await db.query('UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1', [oldId, newId]);
  },

  async revokeFamily(db: Executor, familyId: string): Promise<void> {
    await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [familyId]);
  },

  async revokeAllForUser(db: Executor, userId: string): Promise<void> {
    await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
  },

  async invalidateResetTokens(db: Executor, userId: string): Promise<void> {
    await db.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [userId]);
  },

  async insertResetToken(db: Executor, userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await db.query('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
      userId,
      tokenHash,
      expiresAt,
    ]);
  },

  async findResetByHash(db: Executor, tokenHash: string): Promise<PasswordResetRow | null> {
    const { rows } = await db.query<PasswordResetRow>(
      'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1 FOR UPDATE',
      [tokenHash],
    );
    return rows[0] ?? null;
  },

  async markResetUsed(db: Executor, id: string): Promise<void> {
    await db.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [id]);
  },
};
