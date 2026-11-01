// Safe image storage: type is decided by the file's magic bytes (never the
// client's claimed MIME type or filename), size is capped, files get random
// names and live outside public/, served only through /api/uploads/[file].
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { badRequest, notFound } from '../errors.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FILE_PATTERN = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

const SIGNATURES = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

const MIME_BY_EXT = Object.fromEntries(SIGNATURES.map((s) => [s.ext, s.mime]));

const uploadDir = () => path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? './uploads');

export function detectImage(buffer) {
  if (buffer.length < 12) return null;
  return SIGNATURES.find((s) => s.test(buffer)) ?? null;
}

// file: a web File/Blob from request.formData()
export async function saveImage(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw badRequest('Attach an image file');
  if (file.size > MAX_IMAGE_BYTES) throw badRequest('Images must be 5 MB or smaller');
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = detectImage(buffer);
  if (!type) throw badRequest('Only JPEG, PNG or WebP images are allowed');
  const name = `${randomBytes(16).toString('hex')}.${type.ext}`;
  await mkdir(uploadDir(), { recursive: true });
  await writeFile(path.join(uploadDir(), name), buffer, { flag: 'wx' });
  return { file: name, mime: type.mime, size: buffer.length, uploaded_at: new Date() };
}

export async function deleteImage(name) {
  if (!FILE_PATTERN.test(name)) return;
  await unlink(path.join(uploadDir(), name)).catch(() => {});
}

export async function readImage(name) {
  if (!FILE_PATTERN.test(name)) throw notFound('Image not found');
  try {
    const data = await readFile(path.join(uploadDir(), name));
    return { data, mime: MIME_BY_EXT[name.split('.').pop()] };
  } catch {
    throw notFound('Image not found');
  }
}
