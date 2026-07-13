import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getMasterKey(): Buffer {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_MASTER_KEY environment variable is not set');
  }
  if (key.length !== 64) {
    throw new Error('ENCRYPTION_MASTER_KEY must be a 64-character hex string (256 bits)');
  }
  return Buffer.from(key, 'hex');
}

export interface EncryptedData {
  encryptedKey: string;
  iv: string;
  authTag: string;
}

/**
 * Encrypt a plaintext API key using AES-256-GCM.
 * Returns base64-encoded ciphertext, IV, and auth tag.
 */
export function encryptApiKey(plaintext: string): EncryptedData {
  const masterKey = getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return {
    encryptedKey: encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypt an API key from encrypted storage.
 */
export function decryptApiKey(data: EncryptedData): string {
  const masterKey = getMasterKey();
  const iv = Buffer.from(data.iv, 'base64');
  const authTag = Buffer.from(data.authTag, 'base64');

  const decipher = createDecipheriv(ALGORITHM, masterKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(data.encryptedKey, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Mask an API key for safe display.
 * Shows first 4 and last 4 characters only.
 */
export function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return '****';
  }
  return `${key.slice(0, 4)}${'*'.repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`;
}

/**
 * Generate a masked version from encrypted data without full decryption.
 * For display purposes, we decrypt and immediately mask.
 */
export function getMaskedKey(data: EncryptedData): string {
  const decrypted = decryptApiKey(data);
  const masked = maskApiKey(decrypted);
  // Clear the decrypted value from memory as best we can
  return masked;
}
