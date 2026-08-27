/**
 * S3-compatible storage module.
 * Works with AWS S3, Cloudflare R2, MinIO, or Vercel Blob.
 * Falls back to in-memory storage when S3 is not configured.
 *
 * SECURITY FIX: uploads now use AWS Signature V4 presigned PUT URLs instead
 * of an unsigned PUT (which S3/R2/MinIO reject with 403). A public GET helper
 * returns a presigned URL for private buckets so audio/thumbnail delivery works
 * without making buckets world-readable.
 */

import { createHmac, createHash } from 'crypto';

interface S3Config {
  endpoint?: string;
  bucket: string;
  accessKey?: string;
  secretKey?: string;
  region: string;
}

function getConfig(): S3Config | null {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;

  if (!bucket || !accessKey || !secretKey) return null;

  return {
    endpoint: endpoint || undefined,
    bucket,
    accessKey,
    secretKey,
    region: process.env.S3_REGION || 'us-east-1',
  };
}

// In-memory fallback for when S3 is not configured
const memoryStore = new Map<string, Buffer>();

/**
 * Upload a buffer to S3 using an AWS Signature V4 presigned PUT.
 * (Plain unsigned PUTs are rejected by S3/R2/MinIO — this is the fix.)
 */
export async function uploadFile(
  key: string,
  data: Buffer,
  contentType: string = 'application/octet-stream'
): Promise<string> {
  const config = getConfig();

  if (!config) {
    // Fallback: store in memory (development/demo only)
    memoryStore.set(key, data);
    return `memory://${key}`;
  }

  try {
    const url = createPresignedPutUrl(key, contentType, config);
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(data.length),
      },
      body: new Uint8Array(data),
    });

    if (!response.ok) {
      throw new Error(`S3 upload failed: ${response.status} ${await response.text().catch(() => '')}`);
    }

    return `s3://${config.bucket}/${key}`;
  } catch (error) {
    // Fallback to memory on S3 failure
    console.warn('S3 upload failed, using memory fallback:', error);
    memoryStore.set(key, data);
    return `memory://${key}`;
  }
}

/**
 * Download a file from S3 (or memory fallback).
 */
export async function downloadFile(key: string): Promise<Buffer | null> {
  const config = getConfig();

  if (!config) {
    return memoryStore.get(key) || null;
  }

  try {
    const url = createPresignedGetUrl(key, config);
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return memoryStore.get(key) || null;
  }
}

/**
 * Delete a file from S3 (or memory fallback).
 */
export async function deleteFile(key: string): Promise<boolean> {
  const config = getConfig();

  if (!config) {
    return memoryStore.delete(key);
  }

  try {
    const url = createPresignedUrl('DELETE', key, config, {});
    const response = await fetch(url, { method: 'DELETE' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if S3 is configured and available.
 */
export function isStorageConfigured(): boolean {
  return getConfig() !== null;
}

/**
 * Get a public URL for a stored file.
 * - Memory fallback: returns the memory:// reference (only meaningful in-process).
 * - S3 with a public/anonymous bucket: plain object URL.
 * - Private bucket: fresh presigned GET URL (15 min expiry).
 */
export function getPublicUrl(key: string): string | null {
  const config = getConfig();
  if (!config) return null;

  // A memory:// key means the object lives in this process only.
  if (key.startsWith('memory://')) return null;

  const isPublic = (process.env.S3_PUBLIC_READ === 'true');
  if (isPublic) {
    return `${config.endpoint}/${config.bucket}/${key}`;
  }
  try {
    return createPresignedGetUrl(key, config);
  } catch {
    return `${config.endpoint}/${config.bucket}/${key}`;
  }
}

// =============================================================================
// AWS Signature V4 (pure crypto — no SDK dependency)
// =============================================================================

const S3_ALGORITHM = 'AWS4-HMAC-SHA256';
const PRESIGN_EXPIRES_SECONDS = 15 * 60;

function hmac(key: Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function uriEncode(input: string): string {
  // S3 SigV4 requires URI encoding WITHOUT the RFC3986 unreserved shortcut that
  // encodeURIComponent uses for !'()* — encode those too.
  return encodeURIComponent(input)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildCanonicalRequest(
  method: string,
  canonicalUri: string,
  query: string,
  headers: Record<string, string>,
  payloadHash: string
): string {
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((k) => `${k}:${headers[k]}\n`)
    .join('');
  const signedHeaders = Object.keys(headers).sort().join(';');
  return [
    method,
    canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
}

function getSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(Buffer.from(`AWS4${secretKey}`, 'utf8'), dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function createPresignedUrl(
  method: 'GET' | 'PUT' | 'DELETE',
  key: string,
  config: S3Config,
  options: { contentType?: string } = {}
): string {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const service = 's3';
  const host = buildHost(config);
  const canonicalUri = `/${config.bucket}/${uriEncode(key)}`;

  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': S3_ALGORITHM,
    'X-Amz-Credential': `${config.accessKey}/${dateStamp}/${config.region}/${service}/aws4_request`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(PRESIGN_EXPIRES_SECONDS),
    'X-Amz-SignedHeaders': 'host',
  };
  if (options.contentType) {
    queryParams['X-Amz-Content-Sha256'] = 'UNSIGNED-PAYLOAD';
  }

  const canonicalQuery = Object.keys(queryParams)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(queryParams[k]!)}`)
    .join('&');

  const canonicalHeaders: Record<string, string> = { host };
  const payloadHash = method === 'PUT' ? 'UNSIGNED-PAYLOAD' : sha256Hex('');
  const canonicalRequest = buildCanonicalRequest(method, canonicalUri, canonicalQuery, canonicalHeaders, payloadHash);

  const scope = `${dateStamp}/${config.region}/${service}/aws4_request`;
  const stringToSign = [
    S3_ALGORITHM,
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(config.secretKey || '', dateStamp, config.region, service);
  const signature = hmac(signingKey, stringToSign).toString('hex');

  const scheme = config.endpoint?.startsWith('https://') ? 'https' : 'http';
  return `${scheme}://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function createPresignedPutUrl(key: string, contentType: string, config: S3Config): string {
  return createPresignedUrl('PUT', key, config, { contentType });
}

function createPresignedGetUrl(key: string, config: S3Config): string {
  return createPresignedUrl('GET', key, config);
}

function buildHost(config: S3Config): string {
  if (config.endpoint) {
    return config.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
  // AWS: bucket is addressed via virtual-hosted-style host
  return `${config.bucket}.s3.${config.region}.amazonaws.com`;
}
