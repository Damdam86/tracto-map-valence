ALTER TABLE public.segments ADD COLUMN geometry JSONB;
CREATE INDEX idx_segments_geometry ON public.segments USING gin (geometry);
COMMENT ON COLUMN public.segments.geometry IS 'Custom GPS coordinates for segment';