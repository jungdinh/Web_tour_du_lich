import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL?.trim() });
const uploadsRoot = path.resolve(process.env.UPLOAD_DIR?.trim() || path.join(process.cwd(), 'uploads'));
const publicBase = process.env.PUBLIC_UPLOADS_BASE_URL?.trim().replace(/\/$/, '');
const dryRun = process.argv.includes('--dry-run');
const mimeExtensions = new Map([
  ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['image/gif', 'gif'],
]);

if (!publicBase) throw new Error('PUBLIC_UPLOADS_BASE_URL is required, for example https://api.example.com/uploads');

const cacheImage = async (sourceUrl) => {
  if (!sourceUrl || sourceUrl.startsWith(publicBase) || sourceUrl.startsWith('/uploads/')) return sourceUrl;
  const parsed = new URL(sourceUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) return sourceUrl;

  const response = await fetch(parsed, { signal: AbortSignal.timeout(20000), redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || '';
  const extension = mimeExtensions.get(contentType);
  if (!extension) throw new Error(`Unsupported content type: ${contentType}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 8 * 1024 * 1024) throw new Error('Image exceeds 8MB');

  const filename = `${randomUUID()}.${extension}`;
  if (!dryRun) await writeFile(path.join(uploadsRoot, 'tours', filename), buffer);
  return `${publicBase}/tours/${filename}`;
};

const main = async () => {
  await mkdir(path.join(uploadsRoot, 'tours'), { recursive: true });
  const result = await pool.query('SELECT id, image_url, gallery FROM tours ORDER BY id');
  let updated = 0;
  let failed = 0;

  for (const tour of result.rows) {
    const originalGallery = Array.isArray(tour.gallery) ? tour.gallery : [];
    const cachedGallery = [];
    for (const imageUrl of originalGallery) {
      try { cachedGallery.push(await cacheImage(imageUrl)); }
      catch (error) { failed += 1; cachedGallery.push(imageUrl); console.warn(`[tour ${tour.id}] ${imageUrl}: ${error.message}`); }
    }
    let cachedCover = tour.image_url;
    try { cachedCover = await cacheImage(tour.image_url || originalGallery[0]); }
    catch (error) { failed += 1; console.warn(`[tour ${tour.id}] cover: ${error.message}`); }

    if (cachedCover !== tour.image_url || cachedGallery.some((url, index) => url !== originalGallery[index])) {
      updated += 1;
      if (!dryRun) {
        await pool.query('UPDATE tours SET image_url = $1, gallery = $2, updated_at = NOW() WHERE id = $3', [cachedCover, cachedGallery, tour.id]);
      }
    }
  }
  console.log(JSON.stringify({ dryRun, tours: result.rowCount, updated, failed, uploadsRoot, publicBase }, null, 2));
};

main().finally(() => pool.end());
