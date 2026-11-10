ALTER TABLE tours
    ADD COLUMN IF NOT EXISTS category VARCHAR(120);

UPDATE tours
SET category = CASE
        WHEN destination ~* '(MICE|team[ -]?building)' THEN 'MICE & Team building'
        WHEN destination ~* U&'(ngh\1EC9 d\01B0\1EE1ng|resort)' THEN U&'Ngh\1EC9 d\01B0\1EE1ng'
        WHEN destination ~* U&'(bi\1EC3n|\0111\1EA3o)' THEN U&'Bi\1EC3n \0111\1EA3o'
        WHEN destination ~* U&'(t\00E2m linh|h\00E0nh h\01B0\01A1ng)' THEN 'Tam linh'
        WHEN destination ~* U&'(v\0103n h\00F3a|l\1ECBch s\1EED)' THEN U&'V\0103n h\00F3a & L\1ECBch s\1EED'
        WHEN destination ~* U&'(kh\00E1m ph\00E1|tr\1EA3i nghi\1EC7m)' THEN U&'Kh\00E1m ph\00E1'
        ELSE COALESCE(NULLIF(category, ''), U&'Tour tr\1ECDn g\00F3i')
    END,
    destination = CASE
        WHEN destination ~* U&'(MICE|team[ -]?building|ngh\1EC9 d\01B0\1EE1ng|resort|bi\1EC3n|\0111\1EA3o|t\00E2m linh|h\00E0nh h\01B0\01A1ng|v\0103n h\00F3a|l\1ECBch s\1EED|kh\00E1m ph\00E1|tr\1EA3i nghi\1EC7m)'
             AND COALESCE(array_length(places, 1), 0) > 0
        THEN places[1]
        ELSE destination
    END;

UPDATE tours
SET description = regexp_replace(regexp_replace(description, 'BestPrice([.]vn)?', 'Vivu', 'gi'), 'TourAI', 'Vivu', 'gi'),
    included = regexp_replace(regexp_replace(included::text, 'BestPrice([.]vn)?', 'Vivu', 'gi'), 'TourAI', 'Vivu', 'gi')::jsonb,
    excluded = regexp_replace(regexp_replace(excluded::text, 'BestPrice([.]vn)?', 'Vivu', 'gi'), 'TourAI', 'Vivu', 'gi')::jsonb,
    itinerary = regexp_replace(regexp_replace(itinerary::text, 'BestPrice([.]vn)?', 'Vivu', 'gi'), 'TourAI', 'Vivu', 'gi')::jsonb
WHERE COALESCE(description, '') ~* '(BestPrice|TourAI)'
   OR included::text ~* '(BestPrice|TourAI)'
   OR excluded::text ~* '(BestPrice|TourAI)'
   OR itinerary::text ~* '(BestPrice|TourAI)';

UPDATE reviews
SET content = regexp_replace(regexp_replace(content, 'BestPrice([.]vn)?', 'Vivu', 'gi'), 'TourAI', 'Vivu', 'gi')
WHERE content ~* '(BestPrice|TourAI)';

CREATE INDEX IF NOT EXISTS idx_tours_category ON tours(category);
