-- Migration 005: Tour bookings and SePay QR payments

CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    booking_code VARCHAR(32) UNIQUE NOT NULL,
    payment_code VARCHAR(32) UNIQUE NOT NULL,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    tour_id INT NOT NULL REFERENCES tours(id) ON DELETE RESTRICT,
    tour_name VARCHAR(500) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    departure_date DATE NOT NULL,
    guest_count INT NOT NULL CHECK (guest_count BETWEEN 1 AND 20),
    unit_price INT NOT NULL CHECK (unit_price >= 0),
    total_amount BIGINT NOT NULL CHECK (total_amount >= 0),
    contact_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(30) NOT NULL,
    note TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'pending_payment'
        CHECK (status IN ('pending_payment', 'paid', 'confirmed', 'cancelled', 'expired', 'refunded')),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    expires_at TIMESTAMP NOT NULL,
    paid_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL DEFAULT 'sepay',
    provider_transaction_id VARCHAR(100) UNIQUE,
    reference_code VARCHAR(255),
    transfer_amount BIGINT NOT NULL CHECK (transfer_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'paid'
        CHECK (status IN ('paid', 'refunded')),
    raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (booking_id, provider_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_bookings_user_created ON bookings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_code ON bookings (payment_code);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings (payment_status, expires_at);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments (booking_id);