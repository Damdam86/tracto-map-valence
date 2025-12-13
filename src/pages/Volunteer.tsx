import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, Circle, AlertCircle, Clock } from "lucide-react";

interface AssignedSegment {
  id: string;
  status: string;
  assigned_to_user_id: string | null;
  assigned_to_team_id: string | null;
  campaign: {
    name: string;
    description: string;
  };
  segment: {
    id: string;
    number_start: number;
    number_end: number;
    side: string;
    street: {
      name: string;
      type: string;
    };
  };
}

const Volunteer = () => {
  const { user } = useAuth();
  const [segments, setSegments] = useState<AssignedSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingSegment, setUpdatingSegment] = useState<string | null>(null);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) {
      fetchAssignedSegments();
    }
  }, [user]);

  const fetchAssignedSegments = async () => {
    if (!user) return;

    try {
      // First, get the teams the user is a member of
      const { data: teamMemberships, error: teamError } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id);

      if (teamError) throw teamError;

      const userTeamIds = teamMemberships?.map(tm => tm.team_id) || [];

      console.log("DEBUG - User ID:", user.id);
      console.log("DEBUG - User teams:", userTeamIds);

      // Fetch team names
      if (userTeamIds.length > 0) {
        const { data: teamsData } = await supabase
          .from("teams")
          .select("id, name")
          .in("id", userTeamIds);

        const teamNamesMap: Record<string, string> = {};
        teamsData?.forEach(team => {
          teamNamesMap[team.id] = team.name;
        });
        setTeamNames(teamNamesMap);
        console.log("DEBUG - Team names:", teamNamesMap);
      }

      // Fetch segments assigned to the user OR to any of their teams
      const queryFilter = `assigned_to_user_id.eq.${user.id}${userTeamIds.length > 0 ? `,assigned_to_team_id.in.(${userTeamIds.join(',')})` : ''}`;
      console.log("DEBUG - Query filter:", queryFilter);

      const { data, error } = await supabase
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

      if (error) throw error;

      console.log("DEBUG - Segments found:", data?.length || 0);
      console.log("DEBUG - Segments data:", data);

      setSegments(data || []);
    } catch (error: any) {
      console.error("DEBUG - Error:", error);
      toast.error("Erreur lors du chargement de vos segments");
    } finally {
      setLoading(false);
    }
  };

  const updateSegmentStatus = async (segmentId: string, newStatus: "todo" | "in_progress" | "done" | "redo") => {
    if (!user) return;

    setUpdatingSegment(segmentId);
    try {
      const { error: updateError } = await supabase
        .from("campaign_segments")
        .update({ 
          status: newStatus,
          last_update_date: new Date().toISOString()
        })
        .eq("id", segmentId);

      if (updateError) throw updateError;

      // Get campaign and segment info for tract_action
      const segment = segments.find(s => s.id === segmentId);
      if (segment && newStatus === "done") {
        const { error: actionError } = await supabase
          .from("tract_actions")
          .insert({
            user_id: user.id,
            campaign_id: segment.campaign as any,
            segment_id: segment.segment.id,
            coverage_level: "full",
          });

        if (actionError) throw actionError;
      }

      toast.success(`Segment marqué comme "${newStatus}"`);
      await fetchAssignedSegments();
    } catch (error: any) {
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setUpdatingSegment(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "done":
        return <CheckCircle2 className="w-5 h-5 text-success-green" />;
      case "in_progress":
        return <Clock className="w-5 h-5 text-status-in-progress" />;
      case "redo":
        return <AlertCircle className="w-5 h-5 text-warning-orange" />;
      default:
        return <Circle className="w-5 h-5 text-status-todo" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      done: "default",
      in_progress: "secondary",
      redo: "destructive",
      todo: "outline",
    };

    const labels: Record<string, string> = {
      done: "Terminé",
      in_progress: "En cours",
      redo: "À refaire",
      todo: "À faire",
    };

    return (
      <Badge variant={variants[status] || "outline"}>
        {labels[status] || status}
      </Badge>
    );
  };

  const getSideLabel = (side: string) => {
    const labels: Record<string, string> = {
      even: "Pairs",
      odd: "Impairs",
      both: "Les deux côtés",
    };
    return labels[side] || side;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ma campagne</h1>
        <p className="text-muted-foreground">
          Les segments qui vous sont assignés
        </p>
      </div>

      {segments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-center">
              Aucun segment assigné
            </p>
            <p className="text-sm text-muted-foreground text-center mt-2">
              Contactez votre coordinateur pour obtenir des segments à tracter
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {segments.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <CardTitle className="flex items-center gap-2">
                      {getStatusIcon(item.status)}
                      {item.segment.street.name}
                    </CardTitle>
                    <CardDescription>
                      N° {item.segment.number_start} à {item.segment.number_end} - {getSideLabel(item.segment.side)}
                    </CardDescription>
                  </div>
                  {getStatusBadge(item.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium mb-1">Campagne</p>
                    <p className="text-sm text-muted-foreground">
                      {item.campaign.name}
                    </p>
                  </div>
                  {item.assigned_to_team_id && teamNames[item.assigned_to_team_id] && (
                    <div>
                      <Badge variant="secondary" className="text-xs">
                        👥 Mission d'équipe : {teamNames[item.assigned_to_team_id]}
                      </Badge>
                    </div>
                  )}
                  {item.assigned_to_user_id && !item.assigned_to_team_id && (
                    <div>
                      <Badge variant="outline" className="text-xs">
                        👤 Mission personnelle
                      </Badge>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {item.status === "todo" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateSegmentStatus(item.id, "in_progress")}
                        disabled={updatingSegment === item.id}
                      >
                        Commencer
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => updateSegmentStatus(item.id, "done")}
                        disabled={updatingSegment === item.id}
                      >
                        Marquer comme fait
                      </Button>
                    </>
                  )}
                  
                  {item.status === "in_progress" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => updateSegmentStatus(item.id, "done")}
                        disabled={updatingSegment === item.id}
                      >
                        Marquer comme fait
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateSegmentStatus(item.id, "todo")}
                        disabled={updatingSegment === item.id}
                      >
                        Remettre à faire
                      </Button>
                    </>
                  )}
                  
                  {item.status === "redo" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateSegmentStatus(item.id, "in_progress")}
                        disabled={updatingSegment === item.id}
                      >
                        Commencer
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => updateSegmentStatus(item.id, "done")}
                        disabled={updatingSegment === item.id}
                      >
                        Marquer comme fait
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Volunteer;