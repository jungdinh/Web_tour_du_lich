-- ============================================================
-- Migration 003: Add BestPrice extended fields
-- ============================================================
-- Chạy SAU 001_initial_schema.sql / 002_add_favorites.sql.
-- Các cột này phục vụ dữ liệu crawl từ BestPrice (highlights,
-- itinerary, gallery, schedule, transport, included/excluded).
-- JSONB được chọn thay vì tách bảng vì:
--   - Dữ liệu ít query sâu (read-mostly cho UI).
--   - Lược bớt bảng trung gian cho đồ án.
-- Cột mới đều nullable để không phá tour có sẵn từ seed cũ.

ALTER TABLE tours
    ADD COLUMN IF NOT EXISTS duration_label    VARCHAR(20),          -- "2N1Đ"
    ADD COLUMN IF NOT EXISTS original_price    INT,                  -- giá gốc (gạch ngang)
    ADD COLUMN IF NOT EXISTS highlights        TEXT[]     DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS places            TEXT[]     DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS topics            TEXT[]     DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS gallery           TEXT[]     DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS itinerary         JSONB      DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS included          JSONB      DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS excluded          JSONB      DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS schedule          JSONB      DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS transport         JSONB      DEFAULT '{}'::JSONB;

-- Index phụ để lọc/tìm nhanh theo source + source_url (idempotent seed).
-- Lưu ý: ON CONFLICT (source_url) cần UNIQUE INDEX không partial vì Postgres
-- không cho dùng partial unique index cho conflict inference. Unique index
-- không partial vẫn cho phép nhiều NULL (NULL không vi phạm unique constraint).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tours_source_url
    ON tours (source_url);

CREATE INDEX IF NOT EXISTS idx_tours_source
    ON tours (source);