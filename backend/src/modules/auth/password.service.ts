import { hash, verify } from '@node-rs/argon2';

// Argon2id (library default algorithm) with OWASP-recommended minimums: 19 MiB, 2 iterations, 1 lane.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const hashPassword = (plain: string): Promise<string> => hash(plain, OPTIONS);

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false; // malformed hash must never crash a login
  }
}

let dummyHash: Promise<string> | undefined;
/** Verified against when the account does not exist, so response time does not reveal it. */
export const getDummyHash = (): Promise<string> => (dummyHash ??= hashPassword('not-a-real-password-0'));
