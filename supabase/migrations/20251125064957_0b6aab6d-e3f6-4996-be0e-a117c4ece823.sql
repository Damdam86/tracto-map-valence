-- Create table for neighborhood/district clusters
CREATE TABLE public.districts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on districts
ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;

-- RLS policies for districts
CREATE POLICY "Anyone can view districts"
ON public.districts
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage districts"
ON public.districts
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'coordinator'::app_role));

-- Add district_id to streets table
ALTER TABLE public.streets
ADD COLUMN district_id UUID REFERENCES public.districts(id) ON DELETE SET NULL;

-- Create table for pre-registered volunteer invitations
CREATE TABLE public.volunteer_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted'))
);

-- Enable RLS on volunteer_invitations
ALTER TABLE public.volunteer_invitations ENABLE ROW LEVEL SECURITY;

-- RLS policies for volunteer_invitations
CREATE POLICY "Admins can manage invitations"
ON public.volunteer_invitations
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'coordinator'::app_role));

CREATE POLICY "Anyone can view invitations"
ON public.volunteer_invitations
FOR SELECT
USING (true);

-- Function to handle accepted invitation
CREATE OR REPLACE FUNCTION public.handle_invitation_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Update the invitation status
  UPDATE public.volunteer_invitations
  SET status = 'accepted',
      accepted_at = now()
  WHERE email = NEW.email;
  
  -- Update the profile with invitation data
  UPDATE public.profiles
  SET first_name = COALESCE(
        (SELECT first_name FROM public.volunteer_invitations WHERE email = NEW.email),
        profiles.first_name
      ),
      last_name = COALESCE(
        (SELECT last_name FROM public.volunteer_invitations WHERE email = NEW.email),
        profiles.last_name
      ),
      phone = COALESCE(
        (SELECT phone FROM public.volunteer_invitations WHERE email = NEW.email),
        profiles.phone
      )
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$;

-- Trigger to handle invitation acceptance
CREATE TRIGGER on_auth_user_created_check_invitation
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_invitation_acceptance();

-- Add trigger for updated_at on districts
CREATE TRIGGER update_districts_updated_at
BEFORE UPDATE ON public.districts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();