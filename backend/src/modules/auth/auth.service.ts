import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { db, type Executor } from '../../database/db';
import { logActivity } from '../../services/activityLog';
import { getMessenger } from '../../services/messenger';
import { AppError, BadRequestError, ConflictError, ErrorCodes, UnauthorizedError } from '../../utils/errors';
import { randomToken, sha256Hex } from '../../utils/crypto';
import { normalizePhone } from '../../utils/phone';
import { usersRepository } from '../users/users.repository';
import { toUserDto, type UserDto, type UserRow } from '../users/users.types';
import { authRepository } from './auth.repository';
import type { RegisterInput } from './auth.schemas';
import { getDummyHash, hashPassword, verifyPassword } from './password.service';
import { signAccessToken } from './token.service';

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // access token lifetime in seconds
}

export interface AuthResult extends AuthTokens {
  user: UserDto;
}

const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS';

/** Creates a refresh token (in `familyId` when rotating) and a fresh access token. */
async function issueSession(
  tx: Executor,
  user: UserRow,
  ctx: RequestContext,
  rotation?: { familyId: string; previousId: string },
): Promise<AuthTokens> {
  const refreshToken = randomToken();
  const inserted = await authRepository.insertRefreshToken(tx, {
    userId: user.id,
    tokenHash: sha256Hex(refreshToken),
    familyId: rotation?.familyId ?? null,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    userAgent: ctx.userAgent,
    ip: ctx.ip,
  });
  if (rotation) await authRepository.markRotated(tx, rotation.previousId, inserted.id);

  const access = signAccessToken(user.id);
  return { accessToken: access.token, refreshToken, expiresIn: access.expiresIn };
}

async function findUserByIdentifier(identifier: string): Promise<UserRow | null> {
  if (identifier.includes('@')) return usersRepository.findByEmail(db, identifier.trim().toLowerCase());
  const phone = normalizePhone(identifier);
  return phone ? usersRepository.findByPhone(db, phone) : null;
}

export const authService = {
  async register(input: RegisterInput, ctx: RequestContext): Promise<AuthResult> {
    if (input.email && (await usersRepository.findByEmail(db, input.email))) {
      throw new ConflictError('An account with this email already exists', 'ACCOUNT_EXISTS');
    }
    if (input.phone && (await usersRepository.findByPhone(db, input.phone))) {
      throw new ConflictError('An account with this phone number already exists', 'ACCOUNT_EXISTS');
    }

    const passwordHash = await hashPassword(input.password);
    try {
      return await db.transaction(async (tx) => {
        const user = await usersRepository.create(tx, {
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          passwordHash,
          preferredLanguage: input.preferredLanguage,
        });
        const tokens = await issueSession(tx, user, ctx);
        await logActivity(tx, { actorId: user.id, action: 'user.registered', entityType: 'user', entityId: user.id, ip: ctx.ip });
        return { user: toUserDto(user), ...tokens };
      });
    } catch (err) {
      // Lost a race with a concurrent registration for the same identifier.
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictError('An account with these details already exists', 'ACCOUNT_EXISTS');
      }
      throw err;
    }
  },

  async login(identifier: string, password: string, ctx: RequestContext): Promise<AuthResult> {
    const user = await findUserByIdentifier(identifier);
    // Always verify against a hash so unknown accounts take as long as wrong passwords.
    const valid = await verifyPassword(user?.password_hash ?? (await getDummyHash()), password);

    if (!user || !valid) {
      if (user) {
        await logActivity(db, { actorId: user.id, action: 'auth.login_failed', entityType: 'user', entityId: user.id, ip: ctx.ip });
      }
      throw new UnauthorizedError('Invalid phone/email or password', INVALID_CREDENTIALS);
    }
    if (user.status !== 'active') {
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account is not active');
    }

    return db.transaction(async (tx) => {
      await usersRepository.touchLastLogin(tx, user.id);
      const tokens = await issueSession(tx, user, ctx);
      await logActivity(tx, { actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, ip: ctx.ip });
      return { user: toUserDto(user), ...tokens };
    });
  },

  /**
   * Rotating refresh tokens. Presenting an already-used token means it was stolen or replayed,
   * so the whole token family is revoked (the legitimate holder must sign in again).
   */
  async refresh(refreshToken: string, ctx: RequestContext): Promise<AuthTokens> {
    type Outcome = { kind: 'ok'; tokens: AuthTokens } | { kind: 'invalid' | 'expired' | 'reuse' | 'inactive' };

    // Failures are returned (not thrown) so the revocations above them still commit.
    const outcome = await db.transaction<Outcome>(async (tx) => {
      const row = await authRepository.findRefreshByHash(tx, sha256Hex(refreshToken), true);
      if (!row) return { kind: 'invalid' };

      if (row.revoked_at) {
        await authRepository.revokeFamily(tx, row.family_id);
        await logActivity(tx, {
          actorId: row.user_id,
          action: 'auth.refresh_reuse_detected',
          entityType: 'user',
          entityId: row.user_id,
          ip: ctx.ip,
        });
        return { kind: 'reuse' };
      }
      if (row.expires_at.getTime() <= Date.now()) return { kind: 'expired' };

      const user = await usersRepository.findById(tx, row.user_id);
      if (!user || user.status !== 'active') {
        await authRepository.revokeFamily(tx, row.family_id);
        return { kind: 'inactive' };
      }

      const tokens = await issueSession(tx, user, ctx, { familyId: row.family_id, previousId: row.id });
      return { kind: 'ok', tokens };
    });

    if (outcome.kind === 'ok') return outcome.tokens;
    if (outcome.kind === 'inactive') throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account is not active');
    throw new UnauthorizedError('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  },

  /** Idempotent: unknown or already-revoked tokens are ignored. */
  async logout(refreshToken: string): Promise<void> {
    const row = await authRepository.findRefreshByHash(db, sha256Hex(refreshToken));
    if (row) await authRepository.revokeFamily(db, row.family_id);
  },

  /** Always resolves the same way, whether or not the account exists. */
  async forgotPassword(identifier: string, ctx: RequestContext): Promise<void> {
    const user = await findUserByIdentifier(identifier);
    if (!user || user.status !== 'active') return;

    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
    await db.transaction(async (tx) => {
      await authRepository.invalidateResetTokens(tx, user.id);
      await authRepository.insertResetToken(tx, user.id, sha256Hex(token), expiresAt);
      await logActivity(tx, { actorId: user.id, action: 'auth.password_reset_requested', entityType: 'user', entityId: user.id, ip: ctx.ip });
    });

    // After commit; delivery problems must not change the response (that would reveal the account).
    try {
      await getMessenger().sendPasswordReset({
        to: { id: user.id, fullName: user.full_name, email: user.email, phone: user.phone },
        token,
        expiresAt,
      });
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Failed to deliver password reset');
    }
  },

  async resetPassword(token: string, newPassword: string, ctx: RequestContext): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    await db.transaction(async (tx) => {
      const row = await authRepository.findResetByHash(tx, sha256Hex(token));
      if (!row || row.used_at || row.expires_at.getTime() <= Date.now()) {
        throw new BadRequestError('Invalid or expired reset token', undefined, 'INVALID_RESET_TOKEN');
      }
      await authRepository.markResetUsed(tx, row.id);
      await usersRepository.updatePassword(tx, row.user_id, passwordHash);
      await authRepository.revokeAllForUser(tx, row.user_id); // sign out every device
      await logActivity(tx, { actorId: row.user_id, action: 'auth.password_reset_completed', entityType: 'user', entityId: row.user_id, ip: ctx.ip });
    });
  },

  /** Returns fresh tokens so the current device stays signed in; every other session is revoked. */
  async changePassword(userId: string, currentPassword: string, newPassword: string, ctx: RequestContext): Promise<AuthTokens> {
    const user = await usersRepository.findById(db, userId);
    if (!user) throw new UnauthorizedError();

    // 400, not 401: a 401 would make the mobile client try (and fail) to refresh its session.
    if (!(await verifyPassword(user.password_hash, currentPassword))) {
      throw new BadRequestError('Current password is incorrect', undefined, 'INVALID_CURRENT_PASSWORD');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestError('New password must be different from the current one', undefined, ErrorCodes.BAD_REQUEST);
    }

    const passwordHash = await hashPassword(newPassword);
    return db.transaction(async (tx) => {
      await usersRepository.updatePassword(tx, userId, passwordHash);
      await authRepository.revokeAllForUser(tx, userId);
      const tokens = await issueSession(tx, user, ctx);
      await logActivity(tx, { actorId: userId, action: 'auth.password_changed', entityType: 'user', entityId: userId, ip: ctx.ip });
      return tokens;
    });
  },
};
