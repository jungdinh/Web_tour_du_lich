-- Migration 006: Email verification for new accounts

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

-- Existing accounts predate email verification and remain usable.
UPDATE users
SET email_verified_at = COALESCE(created_at, CURRENT_TIMESTAMP)
WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS email_verification_codes (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(128) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    consumed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_verification_codes_user_created
    ON email_verification_codes (user_id, created_at DESC);