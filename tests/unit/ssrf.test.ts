import { describe, it, expect, beforeEach } from 'vitest';
import { isObviouslyPrivate } from '@/lib/ssrf/protection';

describe('SSRF Protection', () => {
  beforeEach(() => {
    process.env.SSRF_ALLOWED_HOSTS = '';
  });

  describe('isObviouslyPrivate', () => {
    it('should detect localhost as private', () => {
      expect(isObviouslyPrivate('http://localhost:8080/api')).toBe(true);
    });

    it('should detect 127.0.0.1 as private', () => {
      expect(isObviouslyPrivate('http://127.0.0.1:3000')).toBe(true);
    });

    it('should detect 10.x.x.x as private', () => {
      expect(isObviouslyPrivate('http://10.0.0.1/api')).toBe(true);
      expect(isObviouslyPrivate('http://10.255.255.255/api')).toBe(true);
    });

    it('should detect 172.16-31.x.x as private', () => {
      expect(isObviouslyPrivate('http://172.16.0.1/api')).toBe(true);
      expect(isObviouslyPrivate('http://172.31.255.255/api')).toBe(true);
    });

    it('should detect 192.168.x.x as private', () => {
      expect(isObviouslyPrivate('http://192.168.1.1/api')).toBe(true);
      expect(isObviouslyPrivate('http://192.168.0.100/api')).toBe(true);
    });

    it('should detect link-local as private', () => {
      expect(isObviouslyPrivate('http://169.254.169.254/metadata')).toBe(true);
    });

    it('should detect .local domains as private', () => {
      expect(isObviouslyPrivate('http://myservice.local/api')).toBe(true);
    });

    it('should detect .internal domains as private', () => {
      expect(isObviouslyPrivate('http://api.internal/v1')).toBe(true);
    });

    it('should allow public IPs', () => {
      expect(isObviouslyPrivate('https://8.8.8.8/api')).toBe(false);
      expect(isObviouslyPrivate('https://1.1.1.1/api')).toBe(false);
    });

    it('should allow public domains', () => {
      expect(isObviouslyPrivate('https://api.openai.com/v1')).toBe(false);
      expect(isObviouslyPrivate('https://eastus.tts.speech.microsoft.com')).toBe(false);
    });

    it('should treat invalid URLs as unsafe', () => {
      expect(isObviouslyPrivate('not-a-url')).toBe(true);
      expect(isObviouslyPrivate('')).toBe(true);
    });

    it('should detect multicast range as private', () => {
      expect(isObviouslyPrivate('http://224.0.0.1/api')).toBe(true);
    });

    it('should detect 0.0.0.0 as private', () => {
      expect(isObviouslyPrivate('http://0.0.0.0:8080')).toBe(true);
    });
  });
});
