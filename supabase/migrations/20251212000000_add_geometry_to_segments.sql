-- Add geometry field to segments table for custom geographic cuts
-- This allows storing specific GPS coordinates for each segment portion

ALTER TABLE public.segments
ADD COLUMN geometry JSONB;

-- Create index for better query performance
CREATE INDEX idx_segments_geometry ON public.segments USING gin (geometry);

-- Add comment
COMMENT ON COLUMN public.segments.geometry IS 'Custom GPS coordinates for segment (array of [lat, lon] points). If null, uses automatic division based on street geometry.';
