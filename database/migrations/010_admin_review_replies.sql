-- Migration 010: Keep official admin replies separate from customer reviews.

CREATE TABLE IF NOT EXISTS review_replies (
    id SERIAL PRIMARY KEY,
    review_id INT NOT NULL UNIQUE REFERENCES reviews(id) ON DELETE CASCADE,
    admin_id INT REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL CHECK (char_length(btrim(content)) BETWEEN 3 AND 2000),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_review_replies_review_id
    ON review_replies(review_id);
