import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import crypto from 'crypto';

let s3Client: S3Client | null = null;

function getS3Client(): S3Client | null {
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    return null;
  }
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT || undefined,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
      forcePathStyle: !!env.S3_ENDPOINT, // Required for R2/MinIO
    });
  }
  return s3Client;
}

/**
 * Check if S3 storage is configured
 */
export function isImageStorageEnabled(): boolean {
  return !!env.S3_BUCKET && !!env.S3_ACCESS_KEY_ID && !!env.S3_SECRET_ACCESS_KEY;
}

/**
 * Generate a deterministic key from the source URL so we don't re-download
 */
function imageKey(sourceUrl: string): string {
  const hash = crypto.createHash('sha256').update(sourceUrl).digest('hex').slice(0, 16);
  const ext = guessExtension(sourceUrl);
  return `events/${hash}${ext}`;
}

function guessExtension(url: string): string {
  const path = new URL(url).pathname.toLowerCase();
  if (path.endsWith('.png')) return '.png';
  if (path.endsWith('.webp')) return '.webp';
  if (path.endsWith('.gif')) return '.gif';
  return '.jpg';
}

/**
 * Download an image from a URL, upload to S3, return the public URL.
 * Returns the original URL if S3 is not configured or upload fails.
 */
export async function storeImage(sourceUrl: string): Promise<string> {
  const client = getS3Client();
  if (!client || !env.S3_BUCKET) {
    return sourceUrl; // Pass through if not configured
  }

  const key = imageKey(sourceUrl);

  // Check if already uploaded
  try {
    await client.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    // Already exists
    return publicUrl(key);
  } catch {
    // Not found, proceed to upload
  }

  // Download
  let buffer: Buffer;
  let contentType: string;
  try {
    const response = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'SLOEvents/1.0 (image cache)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      logger.warn(`Failed to download image: ${response.status} ${sourceUrl}`);
      return sourceUrl;
    }
    buffer = Buffer.from(await response.arrayBuffer());
    contentType = response.headers.get('content-type') || 'image/jpeg';
  } catch (err) {
    logger.warn(`Failed to download image: ${sourceUrl}`, err);
    return sourceUrl;
  }

  // Upload
  try {
    await client.send(new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    logger.info(`Stored image: ${key} (${buffer.length} bytes)`);
    return publicUrl(key);
  } catch (err) {
    logger.warn(`Failed to upload image to S3: ${key}`, err);
    return sourceUrl;
  }
}

/**
 * Store multiple images, returns array of stored URLs
 */
export async function storeImages(urls: string[]): Promise<string[]> {
  if (!isImageStorageEnabled() || urls.length === 0) return urls;
  return Promise.all(urls.map(storeImage));
}

function publicUrl(key: string): string {
  if (env.S3_PUBLIC_URL) {
    return `${env.S3_PUBLIC_URL}/${key}`;
  }
  // Default S3 URL format
  return `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com/${key}`;
}
