-- Preserve booking and payment history when an account is deleted.
-- Contact details are already stored on each booking for audit and support.

ALTER TABLE bookings
ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS bookings_user_id_fkey;

ALTER TABLE bookings
ADD CONSTRAINT bookings_user_id_fkey
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
