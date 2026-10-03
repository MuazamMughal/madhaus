import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

/**
 * Password hashing.
 *
 * scrypt from Node's own crypto, rather than argon2 or bcrypt. Both of those are native
 * addons that need a compiler at install time and break on runtime upgrades; scrypt is
 * memory-hard, built in, and has no install story at all. The parameters below are
 * Node's own defaults scaled up, and they are stored in the hash string so they can be
 * raised later without invalidating existing passwords.
 */

const PARAMS = { N: 16_384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 10) {
    throw new Error("Password must be at least 10 characters.");
  }
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH, PARAMS);
  // Self-describing, so the cost can be raised later and old hashes still verify.
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltBase64, hashBase64] = parts;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltBase64, "base64");
    expected = Buffer.from(hashBase64, "base64");
  } catch {
    return false;
  }

  const derived = await scrypt(password, salt, expected.length, {
    N: Number.parseInt(n, 10),
    r: Number.parseInt(r, 10),
    p: Number.parseInt(p, 10),
  });

  // Constant time, so response timing does not leak how much of the hash matched.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
