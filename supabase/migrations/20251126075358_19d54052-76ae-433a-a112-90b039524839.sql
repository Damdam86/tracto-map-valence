-- Nettoyer les coordonnées des rues hors de Portes-lès-Valence
-- Bounding box strict : 44.865-44.885 lat, 4.865-4.895 lon

UPDATE streets 
SET coordinates = NULL 
WHERE coordinates IS NOT NULL
AND jsonb_array_length(coordinates::jsonb) > 0
AND (
  -- Vérifier le premier segment, premier point
  (
    (coordinates::jsonb->0->0->0)::text::float < 44.865 OR 
    (coordinates::jsonb->0->0->0)::text::float > 44.885 OR
    (coordinates::jsonb->0->0->1)::text::float < 4.865 OR
    (coordinates::jsonb->0->0->1)::text::float > 4.895
  )
);