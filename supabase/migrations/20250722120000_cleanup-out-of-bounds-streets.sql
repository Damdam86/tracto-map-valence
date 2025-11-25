-- Cleanup out-of-bounds street coordinates for Portes-lès-Valence
-- Bounding box: 44.865-44.885 latitude, 4.865-4.895 longitude

UPDATE streets
SET coordinates = NULL
WHERE coordinates IS NOT NULL
  AND jsonb_typeof(coordinates) = 'array'
  AND jsonb_typeof(coordinates->0) = 'array'
  AND jsonb_typeof(coordinates->0->0) = 'array'
  AND (
    (coordinates->0->0->0)::text::float < 44.865 OR
    (coordinates->0->0->0)::text::float > 44.885 OR
    (coordinates->0->0->1)::text::float < 4.865 OR
    (coordinates->0->0->1)::text::float > 4.895
  );
