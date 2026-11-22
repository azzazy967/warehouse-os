import { join, resolve } from 'path';

/** URL prefix exposed by the API middleware for uploaded product images. */
export const UPLOAD_URL_PREFIX = '/uploads';

/** Filesystem directory backing the upload URL prefix. */
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? resolve(process.env.UPLOAD_DIR)
  : join(process.cwd(), 'uploads');
