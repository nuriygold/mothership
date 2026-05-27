import { createHmac, timingSafeEqual } from 'node:crypto';

export const OWNER_COOKIE = 'mothership-owner-id';
export const OWNER_COOKIE_SUBJECT = 'owner';
const OWNER_COOKIE_VERSION = 'v1';
const OWNER_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30;

type OwnerCookiePayload = {
  v: typeof OWNER_COOKIE_VERSION;
  sub: typeof OWNER_COOKIE_SUBJECT;
  iat: number;
  exp: number;
};

type OwnerCookieVerification =
  | { ok: true; payload: OwnerCookiePayload }
  | { ok: false; reason: 'missing' | 'malformed' | 'invalid' | 'expired' | 'misconfigured' };

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getOwnerAuthSecret() {
  const secret = String(
    process.env.OWNER_AUTH_SECRET ??
    process.env.CRON_SECRET ??
    '',
  ).trim();

  return secret || null;
}

function signPayload(encodedPayload: string, secret: string) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function safeEqualString(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createOwnerCookieValue(now = Date.now()) {
  const secret = getOwnerAuthSecret();
  if (!secret) {
    throw new Error('Owner auth secret is not configured.');
  }

  const iat = Math.floor(now / 1000);
  const payload: OwnerCookiePayload = {
    v: OWNER_COOKIE_VERSION,
    sub: OWNER_COOKIE_SUBJECT,
    iat,
    exp: iat + OWNER_COOKIE_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyOwnerCookieValue(rawValue: string | null | undefined, now = Date.now()): OwnerCookieVerification {
  const value = String(rawValue ?? '').trim();
  if (!value) {
    return { ok: false, reason: 'missing' };
  }

  const secret = getOwnerAuthSecret();
  if (!secret) {
    return { ok: false, reason: 'misconfigured' };
  }

  const dotIndex = value.indexOf('.');
  if (dotIndex <= 0 || dotIndex === value.length - 1) {
    return { ok: false, reason: 'malformed' };
  }

  const encodedPayload = value.slice(0, dotIndex);
  const providedSignature = value.slice(dotIndex + 1);

  let payload: OwnerCookiePayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as OwnerCookiePayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (
    payload?.v !== OWNER_COOKIE_VERSION ||
    payload?.sub !== OWNER_COOKIE_SUBJECT ||
    !Number.isFinite(payload?.iat) ||
    !Number.isFinite(payload?.exp)
  ) {
    return { ok: false, reason: 'invalid' };
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  if (!safeEqualString(expectedSignature, providedSignature)) {
    return { ok: false, reason: 'invalid' };
  }

  const nowSeconds = Math.floor(now / 1000);
  if (payload.exp <= nowSeconds) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, payload };
}

export function getOwnerCookieMaxAgeSeconds() {
  return OWNER_COOKIE_TTL_SECONDS;
}

export function getOwnerPassphrase() {
  const passphrase = String(process.env.OWNER_PASSPHRASE ?? '').trim();
  return passphrase || null;
}
