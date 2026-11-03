CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    type VARCHAR(30) NOT NULL CHECK (type IN ('system', 'promotion', 'booking', 'payment', 'tour', 'account')),
    priority VARCHAR(12) NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
    title VARCHAR(160) NOT NULL,
    body TEXT NOT NULL,
    action_url VARCHAR(500),
    action_label VARCHAR(60),
    audience VARCHAR(12) NOT NULL CHECK (audience IN ('all', 'selected')),
    status VARCHAR(16) NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'cancelled')),
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT notifications_action_url_is_internal
        CHECK (action_url IS NULL OR (action_url LIKE '/%' AND action_url NOT LIKE '//%'))
);

CREATE TABLE IF NOT EXISTS notification_recipients (
    notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delivered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP,
    dismissed_at TIMESTAMP,
    PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_published
    ON notifications(status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_recipients_user
    ON notification_recipients(user_id, notification_id);

CREATE INDEX IF NOT EXISTS idx_notification_recipients_unread
    ON notification_recipients(user_id, notification_id)
    WHERE read_at IS NULL AND dismissed_at IS NULL;
