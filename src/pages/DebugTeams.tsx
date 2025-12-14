import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DebugTeams = () => {
  const { user } = useAuth();
  const [teamMemberships, setTeamMemberships] = useState<any[]>([]);
  const [allTeams, setAllTeams] = useState<any[]>([]);
  const [teamSegments, setTeamSegments] = useState<any[]>([]);
  const [volunteerQueryResult, setVolunteerQueryResult] = useState<any>(null);
  const [queryError, setQueryError] = useState<any>(null);

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

      // Test the exact query used in Volunteer.tsx
      if (memberships && memberships.length > 0) {
        const userTeamIds = memberships.map(tm => tm.team_id);
        const queryFilter = `assigned_to_user_id.eq.${user.id}${userTeamIds.length > 0 ? `,assigned_to_team_id.in.(${userTeamIds.join(',')})` : ''}`;

        console.log("🔍 Testing Volunteer.tsx query");
        console.log("Query filter:", queryFilter);

        const { data: volunteerSegments, error: volunteerError } = await supabase
          .from("campaign_segments")
          .select(`
            id,
            status,
            assigned_to_user_id,
            assigned_to_team_id,
            campaign:campaigns(name, description),
            segment:segments(
              id,
              number_start,
              number_end,
              side,
              street:streets(name, type)
            )
          `)
          .or(queryFilter)
          .order("status");

        if (volunteerError) {
          console.error("❌ Query error:", volunteerError);
          setQueryError(volunteerError);
        } else {
          console.log("✅ Query success! Found segments:", volunteerSegments?.length || 0);
          setVolunteerQueryResult({
            filter: queryFilter,
            userTeamIds,
            segmentsFound: volunteerSegments?.length || 0,
            segments: volunteerSegments
          });
        }
      }
    } catch (error: any) {
      console.error("Debug error:", error);
      setQueryError(error);
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

      <Card>
        <CardHeader>
          <CardTitle>🔍 Volunteer.tsx Query Test</CardTitle>
        </CardHeader>
        <CardContent>
          {queryError ? (
            <div className="bg-red-50 border border-red-200 rounded p-4">
              <p className="text-red-700 font-bold">❌ Query Error:</p>
              <pre className="text-xs bg-white p-2 rounded overflow-auto mt-2">
                {JSON.stringify(queryError, null, 2)}
              </pre>
            </div>
          ) : volunteerQueryResult ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded p-4">
                <p className="text-green-700 font-bold">
                  ✅ Query Success: {volunteerQueryResult.segmentsFound} segments found
                </p>
              </div>
              <div>
                <p className="font-bold mb-1">Query Filter:</p>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
                  {volunteerQueryResult.filter}
                </pre>
              </div>
              <div>
                <p className="font-bold mb-1">User Team IDs:</p>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
                  {JSON.stringify(volunteerQueryResult.userTeamIds, null, 2)}
                </pre>
              </div>
              <div>
                <p className="font-bold mb-1">Segments Found ({volunteerQueryResult.segmentsFound}):</p>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-96">
                  {JSON.stringify(volunteerQueryResult.segments, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Loading query test...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DebugTeams;
