-- Créer les types énumérés
CREATE TYPE app_role AS ENUM ('admin', 'coordinator', 'volunteer');
CREATE TYPE street_type AS ENUM ('street', 'avenue', 'impasse', 'boulevard', 'place', 'chemin', 'route');
CREATE TYPE segment_side AS ENUM ('even', 'odd', 'both');
CREATE TYPE building_type AS ENUM ('houses', 'buildings', 'mixed');
CREATE TYPE campaign_status AS ENUM ('planned', 'ongoing', 'finished');
CREATE TYPE segment_status AS ENUM ('todo', 'in_progress', 'done', 'redo');
CREATE TYPE coverage_level AS ENUM ('full', 'partial');

-- Table des profils utilisateurs (liée à auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table des rôles utilisateurs (séparée pour la sécurité)
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'volunteer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Table des rues
CREATE TABLE streets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type street_type NOT NULL DEFAULT 'street',
  district TEXT,
  neighborhood TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table des segments de rues
CREATE TABLE segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  street_id UUID NOT NULL REFERENCES streets(id) ON DELETE CASCADE,
  number_start INTEGER NOT NULL,
  number_end INTEGER NOT NULL,
  side segment_side NOT NULL DEFAULT 'both',
  building_type building_type NOT NULL DEFAULT 'mixed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_numbers CHECK (number_end >= number_start)
);

-- Table des campagnes
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  status campaign_status NOT NULL DEFAULT 'planned',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table de liaison campagnes-segments
CREATE TABLE campaign_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  status segment_status NOT NULL DEFAULT 'todo',
  assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_update_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, segment_id)
);

-- Table des actions de tractage
CREATE TABLE tract_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  coverage_level coverage_level NOT NULL DEFAULT 'full',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fonction pour vérifier si un utilisateur a un rôle
CREATE OR REPLACE FUNCTION has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Fonction pour créer un profil automatiquement lors de l'inscription
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, first_name, last_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email
  );
  
  -- Assigner le rôle par défaut (volunteer)
  INSERT INTO user_roles (user_id, role)
  VALUES (NEW.id, 'volunteer');
  
  RETURN NEW;
END;
$$;

-- Trigger pour créer le profil automatiquement
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Fonction pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Triggers pour updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_streets_updated_at
  BEFORE UPDATE ON streets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_segments_updated_at
  BEFORE UPDATE ON segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaign_segments_updated_at
  BEFORE UPDATE ON campaign_segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes pour performances
CREATE INDEX idx_segments_street_id ON segments(street_id);
CREATE INDEX idx_campaign_segments_campaign_id ON campaign_segments(campaign_id);
CREATE INDEX idx_campaign_segments_segment_id ON campaign_segments(segment_id);
CREATE INDEX idx_campaign_segments_assigned_to ON campaign_segments(assigned_to_user_id);
CREATE INDEX idx_tract_actions_user_id ON tract_actions(user_id);
CREATE INDEX idx_tract_actions_campaign_id ON tract_actions(campaign_id);
CREATE INDEX idx_tract_actions_segment_id ON tract_actions(segment_id);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);

-- Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE streets ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tract_actions ENABLE ROW LEVEL SECURITY;

-- Policies pour profiles
CREATE POLICY "Users can view all profiles" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Policies pour user_roles
CREATE POLICY "Users can view all roles" ON user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage roles" ON user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Policies pour streets (lecture publique, écriture admins/coordinateurs)
CREATE POLICY "Anyone can view streets" ON streets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert streets" ON streets FOR INSERT TO authenticated 
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordinator'));
CREATE POLICY "Admins can update streets" ON streets FOR UPDATE TO authenticated 
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordinator'));
CREATE POLICY "Admins can delete streets" ON streets FOR DELETE TO authenticated 
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordinator'));

-- Policies pour segments
CREATE POLICY "Anyone can view segments" ON segments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert segments" ON segments FOR INSERT TO authenticated 
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordinator'));
CREATE POLICY "Admins can update segments" ON segments FOR UPDATE TO authenticated 
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordinator'));
CREATE POLICY "Admins can delete segments" ON segments FOR DELETE TO authenticated 
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordinator'));

-- Policies pour campaigns
CREATE POLICY "Anyone can view campaigns" ON campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert campaigns" ON campaigns FOR INSERT TO authenticated 
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordinator'));
CREATE POLICY "Admins can update campaigns" ON campaigns FOR UPDATE TO authenticated 
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordinator'));
CREATE POLICY "Admins can delete campaigns" ON campaigns FOR DELETE TO authenticated 
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordinator'));

-- Policies pour campaign_segments
CREATE POLICY "Anyone can view campaign segments" ON campaign_segments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can assign segments" ON campaign_segments FOR INSERT TO authenticated 
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordinator'));
CREATE POLICY "Admins can update assignments" ON campaign_segments FOR UPDATE TO authenticated 
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordinator'));
CREATE POLICY "Assigned users can update their segments" ON campaign_segments FOR UPDATE TO authenticated 
  USING (auth.uid() = assigned_to_user_id);
CREATE POLICY "Admins can delete assignments" ON campaign_segments FOR DELETE TO authenticated 
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordinator'));

-- Policies pour tract_actions
CREATE POLICY "Anyone can view tract actions" ON tract_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create their own tract actions" ON tract_actions FOR INSERT TO authenticated 
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage all tract actions" ON tract_actions FOR ALL TO authenticated 
  USING (has_role(auth.uid(), 'admin'));