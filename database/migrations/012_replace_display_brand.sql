-- Migration 012: Replace imported display text branding with TourAI.
-- Source metadata and image URLs remain unchanged because they are used for
-- provenance, deduplication, and loading remote images.

UPDATE tours AS t
SET description = regexp_replace(
        regexp_replace(t.description, 'BestPrice[.]vn', 'TourAI', 'gi'),
        'BestPrice', 'TourAI', 'gi'
    ),
    included = CASE
        WHEN jsonb_typeof(t.included) = 'array' THEN (
            SELECT COALESCE(
                jsonb_agg(
                    to_jsonb(
                        regexp_replace(
                            regexp_replace(item.value, 'BestPrice[.]vn', 'TourAI', 'gi'),
                            'BestPrice', 'TourAI', 'gi'
                        )
                    ) ORDER BY item.item_order
                ),
                '[]'::JSONB
            )
            FROM jsonb_array_elements_text(t.included)
                WITH ORDINALITY AS item(value, item_order)
        )
        ELSE t.included
    END,
    excluded = CASE
        WHEN jsonb_typeof(t.excluded) = 'array' THEN (
            SELECT COALESCE(
                jsonb_agg(
                    to_jsonb(
                        regexp_replace(
                            regexp_replace(item.value, 'BestPrice[.]vn', 'TourAI', 'gi'),
                            'BestPrice', 'TourAI', 'gi'
                        )
                    ) ORDER BY item.item_order
                ),
                '[]'::JSONB
            )
            FROM jsonb_array_elements_text(t.excluded)
                WITH ORDINALITY AS item(value, item_order)
        )
        ELSE t.excluded
    END,
    itinerary = CASE
        WHEN jsonb_typeof(t.itinerary) = 'array' THEN (
            SELECT COALESCE(
                jsonb_agg(
                    CASE
                        WHEN jsonb_typeof(day_item.value) = 'object'
                             AND jsonb_typeof(day_item.value->'content') = 'array'
                        THEN jsonb_set(
                            day_item.value,
                            '{content}',
                            (
                                SELECT COALESCE(
                                    jsonb_agg(
                                        to_jsonb(
                                            regexp_replace(
                                                regexp_replace(content_item.value, 'BestPrice[.]vn', 'TourAI', 'gi'),
                                                'BestPrice', 'TourAI', 'gi'
                                            )
                                        ) ORDER BY content_item.content_order
                                    ),
                                    '[]'::JSONB
                                )
                                FROM jsonb_array_elements_text(day_item.value->'content')
                                    WITH ORDINALITY AS content_item(value, content_order)
                            ),
                            false
                        )
                        ELSE day_item.value
                    END ORDER BY day_item.day_order
                ),
                '[]'::JSONB
            )
            FROM jsonb_array_elements(t.itinerary)
                WITH ORDINALITY AS day_item(value, day_order)
        )
        ELSE t.itinerary
    END
WHERE t.description ILIKE '%bestprice%'
   OR t.included::TEXT ILIKE '%bestprice%'
   OR t.excluded::TEXT ILIKE '%bestprice%'
   OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
            CASE
                WHEN jsonb_typeof(t.itinerary) = 'array' THEN t.itinerary
                ELSE '[]'::JSONB
            END
        ) AS itinerary_item
        WHERE (itinerary_item->'content')::TEXT ILIKE '%bestprice%'
           OR itinerary_item->>'day' ILIKE '%bestprice%'
           OR itinerary_item->>'meal' ILIKE '%bestprice%'
   );

UPDATE reviews AS r
SET content = regexp_replace(
        regexp_replace(r.content, 'BestPrice[.]vn', 'TourAI', 'gi'),
        'BestPrice', 'TourAI', 'gi'
    )
WHERE r.content ILIKE '%bestprice%';
