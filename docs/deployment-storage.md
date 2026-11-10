# Luu tru anh tour khi deploy

Vivu luu anh upload trong thu muc do `UPLOAD_DIR` chi dinh va phuc vu qua `/uploads`.

## Nen tang co persistent volume

1. Gan volume ben vung, vi du tai `/data/uploads`.
2. Dat `UPLOAD_DIR=/data/uploads`.
3. Dat `PUBLIC_UPLOADS_BASE_URL=https://api.ten-mien-cua-ban.vn/uploads`.
4. Chay migration, sau do chay `npm run images:cache` trong `web-be` de tai cac anh nguon hien co ve volume.

Anh se con nguyen sau khi redeploy vi nam tren volume, khong nam trong filesystem tam cua container.

## Nen tang khong co persistent volume

Khong nen luu anh truc tiep trong container vi anh se mat khi redeploy. Khi do can thay backend luu file bang object storage tuong thich S3 nhu Cloudflare R2, AWS S3 hoac Supabase Storage; database chi luu URL public/CDN.

Co the kiem tra truoc ma khong ghi database bang `npm run images:cache -- --dry-run`.
