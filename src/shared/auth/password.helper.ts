import bcrypt from "bcrypt";

// 12 rounds is the current sensible default — meaningfully slower for an
// attacker while staying well within an acceptable per-login cost.
const SALT_ROUNDS = 12;

/**
 * `bcrypt`, not `bcryptjs`.
 *
 * Both produce identical `$2b$` hashes — the stored ones keep working either
 * way — but `bcryptjs` is pure JavaScript and hashes *on the event loop*. It
 * does not use libuv's thread pool, so `await` buys nothing and the whole
 * process stalls for the duration. Measured on this codebase at cost 12: ten
 * concurrent compares took 2443 ms and stalled the event loop for a full
 * second, which is why 500 concurrent logins collapsed to a 23.6% success rate
 * (see docs/LOAD_TESTING.md). The same ten through the native binding take
 * 657 ms and stall it for 6 ms.
 *
 * The native package ships N-API prebuilds inside its own tarball — including
 * a musl build for the Alpine image — so there is no compile step, no download
 * at install time, and no rebuild across Node versions.
 */

/**
 * Hashes a plaintext password.
 *
 * Note the 72-byte limit enforced by `MAX_PASSWORD_BYTES` at the validation
 * layer: bcrypt itself silently ignores everything past 72 bytes rather than
 * failing, so the cap has to be applied before the password ever reaches here.
 */
export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, SALT_ROUNDS);

/** Compares a plaintext password against a bcrypt hash. */
export const comparePassword = (
  plain: string,
  hash: string,
): Promise<boolean> => bcrypt.compare(plain, hash);

/**
 * bcrypt reads at most 72 bytes of the password and discards the rest without
 * complaint. Anything longer is accepted at registration and then authenticates
 * on its first 72 bytes alone, so the tail contributes nothing — a password of
 * 92 characters really has 72. Capping at the algorithm's own limit is what
 * makes "your whole password counts" true.
 */
export const MAX_PASSWORD_BYTES = 72;
