-- Table des équipes
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table des membres d'équipes
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- Modifier la table campaign_segments pour supporter les équipes
ALTER TABLE campaign_segments
ADD COLUMN assigned_to_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

-- Index pour performances
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_campaign_segments_team_id ON campaign_segments(assigned_to_team_id);

-- Trigger pour updated_at sur teams
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS pour teams
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Policies pour teams
CREATE POLICY "Anyone can view teams" ON teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert teams" ON teams FOR INSERT TO authenticated 
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordinator'));
CREATE POLICY "Admins can update teams" ON teams FOR UPDATE TO authenticated 
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordinator'));
CREATE POLICY "Admins can delete teams" ON teams FOR DELETE TO authenticated 
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordinator'));

-- Policies pour team_members
CREATE POLICY "Anyone can view team members" ON team_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert team members" ON team_members FOR INSERT TO authenticated 
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordinator'));
CREATE POLICY "Admins can delete team members" ON team_members FOR DELETE TO authenticated 
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordinator'));

-- Mettre à jour les policies de campaign_segments pour supporter les équipes
DROP POLICY IF EXISTS "Assigned users can update their segments" ON campaign_segments;
CREATE POLICY "Assigned users or team members can update segments" ON campaign_segments 
  FOR UPDATE TO authenticated 
  USING (
    auth.uid() = assigned_to_user_id 
    OR EXISTS (
      SELECT 1 FROM team_members 
      WHERE team_members.team_id = campaign_segments.assigned_to_team_id 
      AND team_members.user_id = auth.uid()
    )
  );