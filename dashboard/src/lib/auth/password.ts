/**
 * Password hashing for Cloudflare Workers (free-tier compatible)
 * Uses PBKDF2 via WebCrypto API — the only KDF available on CF Workers.
 *
 * Free-tier constraint: 10ms CPU time per request.
 * 10,000 iterations ≈ 2ms CPU (verified via POC on V8).
 * This is weaker than the OWASP-recommended 600K+ but is the maximum
 * that fits within the free tier CPU budget alongside D1 queries + CSV building.
 *
 * For paid plan ($5/mo, 30s CPU), increase PBKDF2_ITERATIONS to 100000.
 */

export const PBKDF2_ITERATIONS = 10_000;

/** Hash a password. Returns 'saltHex:hashHex' string (~97 chars). */
export async function hashPassword(
  password: string,
  providedSalt?: Uint8Array,
): Promise<string> {
  const encoder = new TextEncoder();
  const salt = providedSalt || crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey'],
  );

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );

  const raw = await crypto.subtle.exportKey('raw', key);
  const buf = new Uint8Array(raw);
  const hex = (b: Uint8Array) =>
    Array.from(b)
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');

  return `${hex(salt)}:${hex(buf)}`;
}

/** Verify a password against a stored hash string. */
export async function verifyPassword(
  storedHash: string,
  passwordAttempt: string,
): Promise<boolean> {
  const [saltHex, originalHash] = storedHash.split(':');
  if (!saltHex || !originalHash) return false;

  const match = saltHex.match(/.{1,2}/g);
  if (!match) return false;

  const salt = new Uint8Array(match.map((b) => parseInt(b, 16)));
  const attempt = await hashPassword(passwordAttempt, salt);
  return attempt.split(':')[1] === originalHash;
}

/** Get (or create) the password hash row from D1. */
export async function getPasswordHash(db: { prepare: (sql: string) => { bind: (...args: any[]) => { first: <T = any>() => Promise<T | null>; run: () => Promise<any> }; } }): Promise<string> {
  const row = await db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .bind('export_password_hash')
    .first<{ value: string }>();
  return row?.value ?? '';
}

/** Save a new password hash to D1. */
export async function setPasswordHash(
  db: { prepare: (sql: string) => { bind: (...args: any[]) => { run: () => Promise<any> }; } },
  hash: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('export_password_hash', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(hash)
    .run();
}
