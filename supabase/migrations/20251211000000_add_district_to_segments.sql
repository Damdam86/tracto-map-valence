-- Add district_id to segments table to allow zone assignment at segment level
ALTER TABLE public.segments
ADD COLUMN district_id UUID REFERENCES public.districts(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX idx_segments_district_id ON public.segments(district_id);

-- Migrate existing street-level zone assignments to segment-level
-- Copy district_id from streets to all their segments
UPDATE public.segments
SET district_id = streets.district_id
FROM public.streets
WHERE segments.street_id = streets.id
  AND streets.district_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN public.segments.district_id IS 'Zone assignment at segment level for fine-grained control';
