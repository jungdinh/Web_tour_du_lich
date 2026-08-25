-- ============================================================
-- Migration 002: Add favorites table (P0)
-- ============================================================
-- Chạy file này nếu database đã tồn tại từ migration 001.
-- File 001_initial_schema.sql đã được cập nhật để include favorites,
-- nên với fresh install chỉ cần chạy 001 là đủ.

CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    tour_id INT REFERENCES tours(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, tour_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_tour_id ON favorites(tour_id);
