-- Migration 007: Google authentication

ALTER TABLE users
    ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255),
    ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'local';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub_unique
    ON users (google_sub)
    WHERE google_sub IS NOT NULL;
