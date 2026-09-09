-- Migration 009: Preserve crawled review aggregates when customers add reviews.

ALTER TABLE tours
    ADD COLUMN IF NOT EXISTS imported_avg_rating FLOAT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS imported_review_count INT NOT NULL DEFAULT 0;

UPDATE tours
SET imported_avg_rating = CASE
        WHEN COALESCE(review_count, 0) > 0 AND (avg_rating IS NULL OR avg_rating <= 0) THEN 8
        WHEN avg_rating IS NULL OR avg_rating <= 0 THEN 0
        WHEN avg_rating <= 5 THEN avg_rating * 2
        ELSE LEAST(avg_rating, 10)
    END,
    imported_review_count = GREATEST(COALESCE(review_count, 0), 0)
WHERE imported_avg_rating = 0
  AND imported_review_count = 0
  AND (COALESCE(avg_rating, 0) <> 0 OR COALESCE(review_count, 0) <> 0);
