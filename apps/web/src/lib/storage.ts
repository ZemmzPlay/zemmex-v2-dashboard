import 'server-only';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
}

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
  };
}

let store: Store | null = null;
export function storage(): Store {
  store ??= process.env.STORAGE_PROVIDER === 's3' ? s3Store() : localStore();
  return store;
}

export type FileKind = 'image' | 'pdf';

/** What the bytes actually are, from their first bytes, never from the name or the browser's claim. */
export function sniff(b: Uint8Array): { type: string; ext: string; kind: FileKind } | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, j) => b[i + j] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { type: 'image/png', ext: 'png', kind: 'image' };
  if (at(0, 0xff, 0xd8, 0xff)) return { type: 'image/jpeg', ext: 'jpg', kind: 'image' };
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { type: 'image/webp', ext: 'webp', kind: 'image' };
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return { type: 'image/gif', ext: 'gif', kind: 'image' };
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return { type: 'application/pdf', ext: 'pdf', kind: 'pdf' };
  return null;
}

export const LIMITS: Record<FileKind, number> = { image: 5 * 1024 * 1024, pdf: 25 * 1024 * 1024 };

export const fileUrl = (key: string) => `/files/${key}`;
