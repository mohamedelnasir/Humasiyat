import type { Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env, isTest } from '../config/env';
import { ErrorCodes } from '../utils/errors';

const handler = (_req: Request, res: Response) => {
  res.status(429).json({
    error: { code: ErrorCodes.TOO_MANY_REQUESTS, message: 'Too many requests, please try again later' },
  });
};

/** Global limiter applied to the whole API. */
export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_SECONDS * 1000,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
  handler,
});

const FIFTEEN_MINUTES = 15 * 60 * 1000;

function identifierOf(req: Request): string {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const raw = body.identifier ?? body.email ?? body.phone ?? '';
  return typeof raw === 'string' ? raw.trim().toLowerCase().slice(0, 254) : '';
}

/**
 * Credential endpoints (login, register, forgot/reset password) get two limiters:
 *  - per IP + account identifier: stops password guessing against one account;
 *  - per IP only: generous, because many mobile users share one carrier-NAT address.
 */
export const authRateLimiters = [
  rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: env.AUTH_IP_RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => isTest,
    handler,
  }),
  rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => isTest,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${identifierOf(req)}`,
    handler,
  }),
];
