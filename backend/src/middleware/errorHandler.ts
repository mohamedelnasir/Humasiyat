import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../config/env';
import { logger } from '../config/logger';
import { AppError, ErrorCodes } from '../utils/errors';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: ErrorCodes.NOT_FOUND, message: `Route not found: ${req.method} ${req.path}` },
  });
};

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

/** Maps PostgreSQL error codes to safe, client-facing responses. */
function mapPgError(err: PgError): AppError | null {
  switch (err.code) {
    case '23P01': // exclusion_violation -> overlapping booking / block
      return new AppError(409, ErrorCodes.SLOT_TAKEN, 'The requested time slot is no longer available', {
        constraint: err.constraint,
      });
    case '23505': // unique_violation
      return new AppError(409, ErrorCodes.CONFLICT, 'A record with these details already exists', {
        constraint: err.constraint,
      });
    case '23503': // foreign_key_violation
      return new AppError(409, ErrorCodes.CONFLICT, 'The operation conflicts with related records', {
        constraint: err.constraint,
      });
    case '23514': // check_violation
    case '23502': // not_null_violation
    case '22P02': // invalid_text_representation (e.g. bad uuid)
      return new AppError(400, ErrorCodes.BAD_REQUEST, 'Invalid data supplied', { constraint: err.constraint });
    default:
      return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let appError: AppError | null = null;

  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof ZodError) {
    appError = new AppError(
      422,
      ErrorCodes.VALIDATION_ERROR,
      'Validation failed',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  } else if (err?.type === 'entity.parse.failed') {
    appError = new AppError(400, ErrorCodes.BAD_REQUEST, 'Malformed JSON body');
  } else if (err?.type === 'entity.too.large') {
    appError = new AppError(413, ErrorCodes.PAYLOAD_TOO_LARGE, 'Request body is too large');
  } else if (err instanceof Error && typeof (err as PgError).code === 'string') {
    appError = mapPgError(err as PgError);
  }

  if (!appError) {
    logger.error({ err, requestId: (req as unknown as { id?: string }).id }, 'Unhandled error');
    res.status(500).json({
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Something went wrong',
        ...(isProduction ? {} : { debug: err instanceof Error ? err.message : String(err) }),
      },
    });
    return;
  }

  if (appError.statusCode >= 500) {
    logger.error({ err }, appError.message);
  }

  res.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
    },
  });
};
