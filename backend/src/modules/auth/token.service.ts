import jwt, { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { env } from '../../config/env';
import { UnauthorizedError, ErrorCodes } from '../../utils/errors';

const ISSUER = 'humasiyat';
const AUDIENCE = 'humasiyat-api';

/**
 * Access tokens carry ONLY the user id. Role and status are read from the database on every
 * authenticated request, so suspensions and role changes take effect immediately and a token
 * can never be used to assert a role.
 */
export function signAccessToken(userId: string): { token: string; expiresIn: number } {
  const token = jwt.sign({}, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
  });
  return { token, expiresIn: env.JWT_ACCESS_TTL_SECONDS };
}

export function verifyAccessToken(token: string): { userId: string } {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload === 'string' || !payload.sub) throw new JsonWebTokenError('missing subject');
    return { userId: payload.sub };
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      throw new UnauthorizedError('Access token expired', ErrorCodes.TOKEN_EXPIRED);
    }
    throw new UnauthorizedError('Invalid access token');
  }
}
