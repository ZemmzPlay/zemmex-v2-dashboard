import { randomBytes } from 'node:crypto';

/** A random, URL-safe ID for file names: 20 characters, unguessable. */
export const createId = () => randomBytes(15).toString('base64url');
