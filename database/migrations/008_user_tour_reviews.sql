-- Migration 008: Link customer reviews to accounts while preserving crawled reviews.

ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_reviews_user_id
    ON reviews(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_tour_unique
    ON reviews(user_id, tour_id)
    WHERE user_id IS NOT NULL;
