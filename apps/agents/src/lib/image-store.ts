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
  const path = new URL(sourceUrl).pathname.toLowerCase();
  const ext = path.endsWith('.png') ? '.png' : path.endsWith('.webp') ? '.webp' : path.endsWith('.gif') ? '.gif' : '.jpg';
  return `events/${hash}${ext}`;
}

function publicUrl(key: string): string {
  if (PUBLIC_URL) return `${PUBLIC_URL}/${key}`;
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

async function storeImage(sourceUrl: string): Promise<string> {
  const client = getClient();
  if (!client || !BUCKET) return sourceUrl;

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
 */
export async function storeImages(urls: string[]): Promise<string[]> {
  if (!BUCKET || !ACCESS_KEY || urls.length === 0) return urls;
  return Promise.all(urls.map(storeImage));
}
