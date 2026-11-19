import type { Request, RequestHandler, Response } from 'express';
import { db } from '../database/db';
import { verifyAccessToken } from '../modules/auth/token.service';
import { usersRepository } from '../modules/users/users.repository';
import type { UserRole } from '../modules/users/users.types';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError, ForbiddenError, UnauthorizedError } from '../utils/errors';

export interface AuthContext {
  userId: string;
  role: UserRole;
}

/** The authenticated caller. Set by `authenticate`; the role comes from the database, never from the client. */
export function getAuth(res: Response): AuthContext {
  const auth = res.locals.auth as AuthContext | undefined;
  if (!auth) throw new UnauthorizedError();
  return auth;
}

export const authenticate: RequestHandler = asyncHandler(async (req: Request, res, next) => {
  const header = req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) throw new UnauthorizedError();

  const { userId } = verifyAccessToken(header.slice(7).trim());
  const user = await usersRepository.findById(db, userId);
  if (!user) throw new UnauthorizedError('Invalid access token');
  if (user.status !== 'active') {
    throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account is not active');
  }

  res.locals.auth = { userId: user.id, role: user.role } satisfies AuthContext;
  next();
});

/** Role-based access control. Always mount after `authenticate`. */
export const requireRole =
  (...roles: UserRole[]): RequestHandler =>
  (_req, res, next) => {
    const { role } = getAuth(res);
    if (!roles.includes(role)) return next(new ForbiddenError());
    next();
  };
