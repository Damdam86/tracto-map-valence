import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DebugTeams = () => {
  const { user } = useAuth();
  const [teamMemberships, setTeamMemberships] = useState<any[]>([]);
  const [allTeams, setAllTeams] = useState<any[]>([]);
  const [teamSegments, setTeamSegments] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetchDebugData();
    }
  }, [user]);

  const fetchDebugData = async () => {
    if (!user) return;

    try {
      // Get user's team memberships
      const { data: memberships } = await supabase
        .from("team_members")
        .select("*, team:teams(id, name, color)")
        .eq("user_id", user.id);

      setTeamMemberships(memberships || []);

      // Get all teams
      const { data: teams } = await supabase
        .from("teams")
        .select("*");

      setAllTeams(teams || []);

      // Get all segments assigned to teams
      const { data: segments } = await supabase
        .from("campaign_segments")
        .select(`
          id,
          assigned_to_team_id,
          assigned_to_user_id,
          campaign:campaigns(name),
          segment:segments(
            id,
            street:streets(name)
          )
        `)
        .not("assigned_to_team_id", "is", null);

      setTeamSegments(segments || []);
    } catch (error: any) {
      console.error("Debug error:", error);
    }
  };

  if (!user) {
    return <div>Please log in</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">🔍 Debug Teams & Assignments</h1>

      <Card>
        <CardHeader>
          <CardTitle>Current User</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
            {JSON.stringify({ id: user.id, email: user.email }, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Team Memberships ({teamMemberships.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {teamMemberships.length === 0 ? (
            <p className="text-red-500">❌ You are NOT a member of any team!</p>
          ) : (
            <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
              {JSON.stringify(teamMemberships, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Teams ({allTeams.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
            {JSON.stringify(allTeams, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Team Segments ({teamSegments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-96">
            {JSON.stringify(teamSegments, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
};

export default DebugTeams;
