-- Supprimer les segments des rues sans coordonnées (hors de Portes-lès-Valence)
DELETE FROM segments
WHERE street_id IN (
  SELECT id FROM streets WHERE coordinates IS NULL
);

-- Supprimer les campaign_segments orphelins (dont le segment n'existe plus)
DELETE FROM campaign_segments
WHERE segment_id NOT IN (SELECT id FROM segments);