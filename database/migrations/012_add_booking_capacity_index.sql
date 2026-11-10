-- Migration 012: Speed up schedule capacity checks for tour departures.

CREATE INDEX IF NOT EXISTS idx_bookings_tour_departure_capacity
    ON bookings (tour_id, departure_date, status, expires_at);
