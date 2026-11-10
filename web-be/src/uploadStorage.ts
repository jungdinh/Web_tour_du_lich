import path from 'node:path';

export const uploadsRoot = path.resolve(process.env.UPLOAD_DIR?.trim() || path.join(process.cwd(), 'uploads'));

export const publicUploadsBaseUrl = (requestBaseUrl: string) => (
  process.env.PUBLIC_UPLOADS_BASE_URL?.trim().replace(/\/$/, '') || `${requestBaseUrl.replace(/\/$/, '')}/uploads`
);
