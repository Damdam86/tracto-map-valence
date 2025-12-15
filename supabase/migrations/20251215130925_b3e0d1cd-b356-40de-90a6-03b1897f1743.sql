-- Add label field to segments table
ALTER TABLE public.segments
ADD COLUMN label VARCHAR(100);

-- Make number_start and number_end nullable for segments that use labels instead
ALTER TABLE public.segments
ALTER COLUMN number_start DROP NOT NULL,
ALTER COLUMN number_end DROP NOT NULL;

-- Add check constraint: either label exists OR both numbers exist
ALTER TABLE public.segments
ADD CONSTRAINT segments_label_or_numbers_check
CHECK (
  (label IS NOT NULL AND label != '')
  OR
  (number_start IS NOT NULL AND number_end IS NOT NULL)
);

-- Add index on label for faster queries
CREATE INDEX idx_segments_label ON public.segments(label) WHERE label IS NOT NULL;

COMMENT ON COLUMN public.segments.label IS 'Descriptive label for the segment (e.g., "Partie Nord", "Segment 1"). Use this instead of number ranges when house numbers are not available.';