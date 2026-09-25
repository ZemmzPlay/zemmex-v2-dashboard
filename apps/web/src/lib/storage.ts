import 'server-only';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Where uploaded files live. `STORAGE_PROVIDER=local` (the default) writes
 * to UPLOAD_DIR on disk, which must be a persistent volume in production.
 * `STORAGE_PROVIDER=s3` uses S3_BUCKET in S3_REGION (and S3_ENDPOINT for
 * S3-compatible stores), with credentials from the usual AWS environment.
 * Files are always served through /files/…, so links don't depend on it.
 */
interface Store {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  remove(key: string): Promise<void>;
  /** Size in bytes, or null when missing. */
  size(key: string): Promise<number | null>;
  /** The first bytes, for checking what a large file really is. */
  head(key: string, bytes: number): Promise<Uint8Array | null>;
  /** A byte range as a stream (inclusive end), for video seeking. */
  range(key: string, start: number, end: number): Promise<ReadableStream<Uint8Array> | null>;
  /**
   * Where the browser sends a large file. S3: a presigned PUT straight to the
   * bucket. Local disk: null, and the app's own streaming endpoint is used.
   */
  uploadUrl(key: string, contentType: string): Promise<string | null>;
  /** Local disk only: writes a stream, refusing more than maxBytes. */
  writeStream(key: string, body: ReadableStream<Uint8Array>, maxBytes: number): Promise<number>;
}

export class TooLargeError extends Error {}

function localStore(): Store {
  const root = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), '../../.data/uploads'));
  const file = (key: string) => {
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw new Error('Bad storage key');
    return p;
  };
  return {
    async put(key, body) {
      await mkdir(path.dirname(file(key)), { recursive: true });
      await writeFile(file(key), body);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(file(key)));
      } catch {
        return null;
      }
    },
    async remove(key) {
      await rm(file(key), { force: true });
    },
    async size(key) {
      try {
        return (await stat(file(key))).size;
      } catch {
        return null;
      }
    },
    async head(key, bytes) {
      try {
        const fh = await open(file(key), 'r');
        try {
          const buf = Buffer.alloc(bytes);
          const { bytesRead } = await fh.read(buf, 0, bytes, 0);
          return new Uint8Array(buf.subarray(0, bytesRead));
        } finally {
          await fh.close();
        }
      } catch {
        return null;
      }
    },
    async range(key, start, end) {
      try {
        await stat(file(key));
      } catch {
        return null;
      }
      return Readable.toWeb(createReadStream(file(key), { start, end })) as ReadableStream<Uint8Array>;
    },
    async uploadUrl() {
      return null;
    },
    async writeStream(key, body, maxBytes) {
      const target = file(key);
      const tmp = `${target}.part`;
      await mkdir(path.dirname(target), { recursive: true });
      let total = 0;
      const counted = Readable.fromWeb(body as never).on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) counted.destroy(new TooLargeError('too large'));
      });
      try {
        await pipeline(counted, createWriteStream(tmp));
      } catch (e) {
        await rm(tmp, { force: true });
        throw e;
      }
      await rename(tmp, target);
      return total;
    },
  };
}

function s3Store(): Store {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is not set');
  // Loaded only when S3 is in use.
  const load = async () => {
    const m = await import('@aws-sdk/client-s3');
    const client = new m.S3Client({ region: process.env.S3_REGION ?? 'me-central-1', endpoint: process.env.S3_ENDPOINT || undefined, forcePathStyle: !!process.env.S3_ENDPOINT });
    return { m, client };
  };
  return {
    async put(key, body, contentType) {
      const { m, client } = await load();
      await client.send(new m.PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      const { m, client } = await load();
      try {
        const r = await client.send(new m.GetObjectCommand({ Bucket: bucket, Key: key }));
        return r.Body ? await r.Body.transformToByteArray() : null;
      } catch {
        return null;
      }
    },
    async remove(key) {
      const { m, client } = await load();
      await client.send(new m.DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async size(key) {
      const { m, client } = await load();
      try {
        return (await client.send(new m.HeadObjectCommand({ Bucket: bucket, Key: key }))).ContentLength ?? null;
      } catch {
        return null;
      }
    },
    async head(key, bytes) {
      const { m, client } = await load();
      try {
        const r = await client.send(new m.GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
        return r.Body ? await r.Body.transformToByteArray() : null;
      } catch {
        return null;
      }
    },
    async range(key, start, end) {
      const { m, client } = await load();
      try {
        const r = await client.send(new m.GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=${start}-${end}` }));
        return (r.Body?.transformToWebStream() as ReadableStream<Uint8Array> | undefined) ?? null;
      } catch {
        return null;
      }
    },
    async uploadUrl(key, contentType) {
      const { m, client } = await load();
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      return getSignedUrl(client, new m.PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn: 3600 });
    },
    async writeStream() {
      throw new Error('Large files go straight to S3 with a presigned URL.');
    },
  };
}

let store: Store | null = null;
export function storage(): Store {
  store ??= process.env.STORAGE_PROVIDER === 's3' ? s3Store() : localStore();
  return store;
}

export type FileKind = 'image' | 'pdf' | 'video';

/** What the bytes actually are, from their first bytes, never from the name or the browser's claim. */
export function sniff(b: Uint8Array): { type: string; ext: string; kind: FileKind } | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, j) => b[i + j] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { type: 'image/png', ext: 'png', kind: 'image' };
  if (at(0, 0xff, 0xd8, 0xff)) return { type: 'image/jpeg', ext: 'jpg', kind: 'image' };
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { type: 'image/webp', ext: 'webp', kind: 'image' };
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return { type: 'image/gif', ext: 'gif', kind: 'image' };
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return { type: 'application/pdf', ext: 'pdf', kind: 'pdf' };
  // ISO base media ("....ftyp"): MP4, M4V and QuickTime.
  if (at(4, 0x66, 0x74, 0x79, 0x70)) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    return brand === 'qt  ' ? { type: 'video/quicktime', ext: 'mov', kind: 'video' } : { type: 'video/mp4', ext: 'mp4', kind: 'video' };
  }
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return { type: 'video/webm', ext: 'webm', kind: 'video' };
  return null;
}

export const LIMITS: Record<FileKind, number> = { image: 5 * 1024 * 1024, pdf: 25 * 1024 * 1024, video: 4 * 1024 * 1024 * 1024 };

export const fileUrl = (key: string) => `/files/${key}`;
