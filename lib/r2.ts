import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export function createR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function getPresignedUploadUrl(
  key: string,
  contentType: string
): Promise<string> {
  const client = createR2Client();
  const command = new PutObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}

export function getPublicUrl(key: string): string {
  return `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${key}`;
}

/**
 * Extract the R2 key from a public URL
 */
export function getKeyFromPublicUrl(publicUrl: string): string | null {
  const base = process.env.CLOUDFLARE_R2_PUBLIC_URL;
  if (!base || !publicUrl.startsWith(base)) return null;
  return publicUrl.slice(base.length + 1); // remove trailing /
}

/**
 * Delete a single object from R2
 */
export async function deleteR2Object(key: string): Promise<void> {
  const client = createR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
      Key: key,
    })
  );
}

/**
 * Delete all objects with a given prefix (e.g. all audio chunks for a video)
 */
export async function deleteR2Prefix(prefix: string): Promise<number> {
  const client = createR2Client();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
  
  const listed = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
  );

  const keys = (listed.Contents || []).map((obj) => obj.Key).filter(Boolean) as string[];
  
  for (const key of keys) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  return keys.length;
}
