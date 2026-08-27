import { describe, it, expect, beforeAll } from 'vitest';
import { encryptApiKey, decryptApiKey, maskApiKey, getMaskedKey } from '@/lib/crypto/encryption';

// Set up test encryption key
beforeAll(() => {
  process.env.ENCRYPTION_MASTER_KEY = 'a'.repeat(64); // 256-bit hex key for testing
});

describe('Encryption', () => {
  describe('encryptApiKey', () => {
    it('should encrypt a plaintext key and return encrypted data', () => {
      const plaintext = 'sk-test-key-12345678901234567890';
      const result = encryptApiKey(plaintext);

      expect(result).toHaveProperty('encryptedKey');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('authTag');
      expect(result.encryptedKey).not.toBe(plaintext);
      expect(result.iv).toBeTruthy();
      expect(result.authTag).toBeTruthy();
    });

    it('should produce different ciphertext for the same input (random IV)', () => {
      const plaintext = 'sk-test-key-same';
      const result1 = encryptApiKey(plaintext);
      const result2 = encryptApiKey(plaintext);

      expect(result1.encryptedKey).not.toBe(result2.encryptedKey);
      expect(result1.iv).not.toBe(result2.iv);
    });
  });

  describe('decryptApiKey', () => {
    it('should correctly decrypt an encrypted key', () => {
      const plaintext = 'sk-test-key-12345678901234567890';
      const encrypted = encryptApiKey(plaintext);
      const decrypted = decryptApiKey(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty string encryption', () => {
      const plaintext = '';
      const encrypted = encryptApiKey(plaintext);
      const decrypted = decryptApiKey(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = 'key-with-unicode-\u1780\u1781\u1782';
      const encrypted = encryptApiKey(plaintext);
      const decrypted = decryptApiKey(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should fail with tampered ciphertext', () => {
      const encrypted = encryptApiKey('test-key');
      // Flip one base64 character *inside* the ciphertext (appending is
      // ignored by the base64 decoder, so it would not trigger GCM auth).
      encrypted.encryptedKey =
        (encrypted.encryptedKey[0] === 'A' ? 'B' : 'A') +
        encrypted.encryptedKey.slice(1);

      expect(() => decryptApiKey(encrypted)).toThrow();
    });

    it('should fail with tampered auth tag', () => {
      const encrypted = encryptApiKey('test-key');
      encrypted.authTag = 'dGFtcGVyZWQ='; // "tampered" in base64

      expect(() => decryptApiKey(encrypted)).toThrow();
    });
  });

  describe('maskApiKey', () => {
    it('should mask a long key showing first 4 and last 4 characters', () => {
      const result = maskApiKey('sk-1234567890abcdef');
      // 18 chars -> 4 shown + 10 masked + 4 shown
      expect(result).toBe('sk-1**********cdef');
      expect(result).not.toContain('567890');
    });

    it('should fully mask a short key', () => {
      const result = maskApiKey('short');
      expect(result).toBe('****');
    });

    it('should handle exactly 8 character key', () => {
      const result = maskApiKey('12345678');
      expect(result).toBe('****');
    });

    it('should handle 9 character key', () => {
      const result = maskApiKey('123456789');
      expect(result).toBe('1234*6789');
    });
  });

  describe('getMaskedKey', () => {
    it('should decrypt and mask in one step', () => {
      const plaintext = 'sk-1234567890abcdef';
      const encrypted = encryptApiKey(plaintext);
      const masked = getMaskedKey(encrypted);

      // 18 chars -> 4 shown + 10 masked + 4 shown
      expect(masked).toBe('sk-1**********cdef');
      expect(masked).not.toContain('567890');
    });
  });
});

describe('Security boundary', () => {
  it('should throw if ENCRYPTION_MASTER_KEY is not set', () => {
    const originalKey = process.env.ENCRYPTION_MASTER_KEY;
    delete process.env.ENCRYPTION_MASTER_KEY;

    expect(() => encryptApiKey('test')).toThrow('ENCRYPTION_MASTER_KEY');

    process.env.ENCRYPTION_MASTER_KEY = originalKey;
  });

  it('should throw if ENCRYPTION_MASTER_KEY is wrong length', () => {
    const originalKey = process.env.ENCRYPTION_MASTER_KEY;
    process.env.ENCRYPTION_MASTER_KEY = 'too-short';

    expect(() => encryptApiKey('test')).toThrow('64-character hex');

    process.env.ENCRYPTION_MASTER_KEY = originalKey;
  });
});
