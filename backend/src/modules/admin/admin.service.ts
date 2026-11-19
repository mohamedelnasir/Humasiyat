import { db } from '../../database/db';
import { logActivity } from '../../services/activityLog';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { authRepository } from '../auth/auth.repository';
import { usersRepository } from '../users/users.repository';
import { toUserDto, type UserDto } from '../users/users.types';

export const adminService = {
  /** Suspend or reactivate an account. Suspension signs the user out of every device immediately. */
  async setUserStatus(
    actorId: string,
    targetId: string,
    status: 'active' | 'suspended',
    reason: string | undefined,
    ip?: string,
  ): Promise<UserDto> {
    if (actorId === targetId) throw new ForbiddenError('You cannot change your own account status');

    return db.transaction(async (tx) => {
      const target = await usersRepository.findById(tx, targetId);
      if (!target) throw new NotFoundError('User not found');
      if (target.role === 'super_admin') throw new ForbiddenError('Super admin accounts cannot be suspended here');

      const updated = await usersRepository.setStatus(tx, targetId, status, reason ?? null);
      if (status === 'suspended') await authRepository.revokeAllForUser(tx, targetId);

      await logActivity(tx, {
        actorId,
        action: 'user.status_changed',
        entityType: 'user',
        entityId: targetId,
        metadata: { from: target.status, to: status, reason: reason ?? null },
        ip,
      });
      return toUserDto(updated);
    });
  },
};
