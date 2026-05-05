import { createCipheriv, createDecipheriv, randomBytes, createSecretKey } from 'crypto';

const ALGO = 'aes-256-gcm';

function toU8(buf: Buffer): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function getKey() {
  const raw = process.env.PLAID_ENCRYPTION_KEY;
  if (!raw) throw new Error('PLAID_ENCRYPTION_KEY is not set');
  const buf = Buffer.from(raw, 'hex');
  if (buf.length !== 32) throw new Error('PLAID_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  return createSecretKey(toU8(buf));
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = toU8(randomBytes(12));
  const cipher = createCipheriv(ALGO, key, iv);
  const a = toU8(cipher.update(plaintext, 'utf8'));
  const b = toU8(cipher.final());
  const encrypted = Buffer.concat([a, b]);
  const tag = cipher.getAuthTag();
  return `${Buffer.from(iv).toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const [ivHex, tagHex, dataHex] = ciphertext.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Invalid encrypted value format');
  const iv = toU8(Buffer.from(ivHex, 'hex'));
  const tag = toU8(Buffer.from(tagHex, 'hex'));
  const data = toU8(Buffer.from(dataHex, 'hex'));
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return toU8(decipher.update(data)).toString() + decipher.final('utf8');
}
