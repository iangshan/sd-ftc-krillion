import { ApiError } from './api-error.mjs';

const SESSION_SECONDS = 2 * 60 * 60;
const ATTEMPT_WINDOW_SECONDS = 5 * 60;
const MAX_ATTEMPTS = 8;
const SESSION_PATTERN = /^Bearer ([0-9a-f]{64})$/;
const encoder = new TextEncoder();

function ownerCredentials(env) {
  const { ADMIN_USERNAME: username, ADMIN_PASSWORD: password } = env;
  if (typeof username !== 'string' || !username || username.length > 128
    || typeof password !== 'string' || password.length < 16 || password.length > 256) return null;
  return { username, password };
}

function nowInSeconds() {
  return Math.floor(Date.now() / 1_000);
}

function digest(...fields) {
  return crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(fields)));
}

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sessionHash(owner, token) {
  return hex(new Uint8Array(await digest('admin-session', owner.username, owner.password, token)));
}

function equalDigest(left, right) {
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let difference = 0;
  for (const [index, byte] of leftBytes.entries()) difference |= byte ^ rightBytes[index];
  return difference === 0;
}

async function countAttempt(request, env, owner, now) {
  // Cloudflare supplies this address. Hash it with the owner's secret before storage.
  const address = request.headers.get('CF-Connecting-IP') || 'unknown';
  const expires = now - (now % ATTEMPT_WINDOW_SECONDS) + ATTEMPT_WINDOW_SECONDS;
  const key = hex(new Uint8Array(await digest('admin-signin', owner.password, address, expires)));

  await env.DB.prepare('DELETE FROM admin_signin_attempts WHERE expires_at <= ?').bind(now).run();
  const row = await env.DB.prepare(`INSERT INTO admin_signin_attempts (attempt_key, attempts, expires_at)
      VALUES (?, 1, ?) ON CONFLICT (attempt_key) DO UPDATE SET attempts = attempts + 1
      WHERE attempts < ? RETURNING attempts`).bind(key, expires, MAX_ATTEMPTS).first();
  if (!row) {
    throw new ApiError(429, 'Too many sign-in attempts. Try again in a few minutes.');
  }
  return key;
}

export async function signIn(request, env, { username, password }) {
  const owner = ownerCredentials(env);
  if (!owner) throw new ApiError(503, 'Owner sign-in is not configured.');

  const now = nowInSeconds();
  const attemptKey = await countAttempt(request, env, owner, now);
  if (typeof username !== 'string' || username.length > 128
    || typeof password !== 'string' || password.length > 256) {
    throw new ApiError(401, 'The username or password is incorrect.');
  }

  const [expected, supplied] = await Promise.all([
    digest('owner-credentials', owner.username, owner.password),
    digest('owner-credentials', username, password),
  ]);
  if (!equalDigest(expected, supplied)) throw new ApiError(401, 'The username or password is incorrect.');

  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const key = await sessionHash(owner, token);
  await env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(now).run();
  await env.DB.prepare('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)')
    .bind(key, now + SESSION_SECONDS).run();
  await env.DB.prepare('DELETE FROM admin_signin_attempts WHERE attempt_key = ?').bind(attemptKey).run();
  return { token };
}

export async function requireAdmin(request, env) {
  const owner = ownerCredentials(env);
  const token = SESSION_PATTERN.exec(request.headers.get('Authorization') || '')?.[1];
  if (!owner || !token) throw new ApiError(401, 'Sign in as the owner to continue.');

  const key = await sessionHash(owner, token);
  const session = await env.DB.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash = ?').bind(key).first();
  if (!session || session.expires_at <= nowInSeconds()) {
    throw new ApiError(401, 'Your admin session has ended. Sign in again.');
  }
  return key;
}

export async function signOut(request, env) {
  const key = await requireAdmin(request, env);
  await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(key).run();
  return { ok: true };
}
