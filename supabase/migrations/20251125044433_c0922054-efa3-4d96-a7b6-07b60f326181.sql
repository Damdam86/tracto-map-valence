-- Add coordinates column to streets table to store GPS coordinates from OpenStreetMap
ALTER TABLE streets ADD COLUMN coordinates jsonb;

-- Add comment to explain the structure
COMMENT ON COLUMN streets.coordinates IS 'Array of [lat, lng] coordinates from OpenStreetMap to draw the street on the map';