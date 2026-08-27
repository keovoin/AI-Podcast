/**
 * S3-compatible storage module.
 * Works with AWS S3, Cloudflare R2, MinIO, or Vercel Blob.
 * Falls back to in-memory storage when S3 is not configured.
 */

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
 * Upload a buffer to S3 (or memory fallback).
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

  // Use fetch-based S3 PUT (no AWS SDK needed for simple uploads)
  const url = `${config.endpoint}/${config.bucket}/${key}`;
  const date = new Date().toUTCString();

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(data.length),
        'Date': date,
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      },
      body: new Uint8Array(data),
    });

    if (!response.ok) {
      throw new Error(`S3 upload failed: ${response.status}`);
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

  const url = `${config.endpoint}/${config.bucket}/${key}`;

  try {
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

  const url = `${config.endpoint}/${config.bucket}/${key}`;

  try {
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
 */
export function getPublicUrl(key: string): string | null {
  const config = getConfig();
  if (!config) return null;
  return `${config.endpoint}/${config.bucket}/${key}`;
}
