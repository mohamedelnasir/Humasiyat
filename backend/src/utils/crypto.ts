import { createHash, randomBytes } from 'crypto';

export const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Opaque, URL-safe random token. Only its SHA-256 hash is ever stored. */
export const randomToken = (bytes = 48): string => randomBytes(bytes).toString('base64url');
