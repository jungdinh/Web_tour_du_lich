-- Migration 011: Add a sample future departure date to every tour.
-- Existing schedule rows are preserved and the operation is idempotent.

UPDATE tours AS t
SET schedule = (
    CASE
        WHEN jsonb_typeof(t.schedule) = 'array' THEN t.schedule
        ELSE '[]'::JSONB
    END
) || jsonb_build_array(
    jsonb_build_object(
        'date', '2027-01-01',
        'price', t.price,
        'available', TRUE
    )
)
WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(t.schedule) = 'array' THEN t.schedule
            ELSE '[]'::JSONB
        END
    ) AS schedule_row
    WHERE schedule_row->>'date' IN ('2027-01-01', '01/01/2027', '01-01-2027')
);
