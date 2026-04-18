import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { logger } from './scraper-utils';
import crypto from 'crypto';

let s3Client: S3Client | null = null;

const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.S3_REGION || 'us-west-2';
const ENDPOINT = process.env.S3_ENDPOINT;
const ACCESS_KEY = process.env.S3_ACCESS_KEY_ID;
const SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY;
const PUBLIC_URL = process.env.S3_PUBLIC_URL;

function getClient(): S3Client | null {
  if (!BUCKET || !ACCESS_KEY || !SECRET_KEY) return null;
  if (!s3Client) {
    s3Client = new S3Client({
      region: REGION,
      endpoint: ENDPOINT || undefined,
      credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
      forcePathStyle: !!ENDPOINT,
    });
  }
  return s3Client;
}

function imageKey(sourceUrl: string): string {
  const hash = crypto.createHash('sha256').update(sourceUrl).digest('hex').slice(0, 16);
  let ext = '.jpg';
  try {
    const path = new URL(sourceUrl).pathname.toLowerCase();
    if (path.endsWith('.png')) ext = '.png';
    else if (path.endsWith('.webp')) ext = '.webp';
    else if (path.endsWith('.gif')) ext = '.gif';
  } catch {
    // Malformed URL — fall back to .jpg extension; caller will skip upload anyway.
  }
  return `events/${hash}${ext}`;
}

function publicUrl(key: string): string {
  if (PUBLIC_URL) return `${PUBLIC_URL}/${key}`;
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

function isValidUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function storeImage(sourceUrl: string): Promise<string> {
  const client = getClient();
  if (!client || !BUCKET) return sourceUrl;
  if (!isValidUrl(sourceUrl)) {
    logger.warn(`[s3] Skipping invalid image URL: ${sourceUrl.slice(0, 120)}`);
    return sourceUrl;
  }

  const key = imageKey(sourceUrl);

  // Check if already uploaded
  try {
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return publicUrl(key);
  } catch {
    // Not found, upload
  }

  let buffer: Buffer;
  let contentType: string;
  try {
    const response = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'SLOEvents/1.0 (image cache)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      logger.warn(`[s3] Failed to download: ${response.status} ${sourceUrl}`);
      return sourceUrl;
    }
    buffer = Buffer.from(await response.arrayBuffer());
    contentType = response.headers.get('content-type') || 'image/jpeg';
  } catch (err) {
    logger.warn(`[s3] Download failed: ${sourceUrl}`);
    return sourceUrl;
  }

  try {
    await client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    logger.info(`[s3] Stored: ${key} (${buffer.length} bytes)`);
    return publicUrl(key);
  } catch (err) {
    logger.warn(`[s3] Upload failed: ${key}`);
    return sourceUrl;
  }
}

/**
 * Store multiple images to S3. Falls through to original URLs if S3 is not configured.
 * Uses allSettled so one broken URL doesn't abort the whole batch — the failing
 * entry just falls back to its original URL (or the pre-validated sentinel).
 */
export async function storeImages(urls: string[]): Promise<string[]> {
  if (!BUCKET || !ACCESS_KEY || urls.length === 0) return urls;
  const results = await Promise.allSettled(urls.map(storeImage));
  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    logger.warn(`[s3] storeImage rejected for ${urls[i]?.slice(0, 120)}: ${r.reason?.message || r.reason}`);
    return urls[i];
  });
}
