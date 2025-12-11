import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MapPin, Users, UserPlus } from "lucide-react";

interface District {
  id: string;
  name: string;
  color: string;
  street_count?: number;
}

interface Volunteer {
  id: string;
  first_name: string;
  last_name: string;
}

interface Team {
  id: string;
  name: string;
  color: string;
}

interface DistrictAssignmentProps {
  campaignId: string;
  onAssignmentComplete: () => void;
}

export const DistrictAssignment = ({ campaignId, onAssignmentComplete }: DistrictAssignmentProps) => {
  const [districts, setDistricts] = useState<District[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [selectedVolunteer, setSelectedVolunteer] = useState<string>("");
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [assignType, setAssignType] = useState<"user" | "team">("user");
  const [loading, setLoading] = useState(false);
  const [streetCount, setStreetCount] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedDistrict) {
      fetchStreetCount();
    }
  }, [selectedDistrict]);

  const fetchData = async () => {
    try {
      const [districtsRes, volunteersRes, teamsRes] = await Promise.all([
        supabase.from("districts").select("id, name, color").order("name"),
        supabase.from("profiles").select("id, first_name, last_name").order("first_name"),
        supabase.from("teams").select("id, name, color").order("name"),
      ]);

      if (districtsRes.error) throw districtsRes.error;
      if (volunteersRes.error) throw volunteersRes.error;
      if (teamsRes.error) throw teamsRes.error;

      // Get street counts for districts
      const districtsWithCounts = await Promise.all(
        (districtsRes.data || []).map(async (district) => {
          const { count } = await supabase
            .from("streets")
            .select("*", { count: "exact", head: true })
            .eq("district_id", district.id);

          return {
            ...district,
            street_count: count || 0,
          };
        })
      );

      setDistricts(districtsWithCounts);
      setVolunteers(volunteersRes.data || []);
      setTeams(teamsRes.data || []);
    } catch (error: any) {
      toast.error("Erreur lors du chargement des données");
    }
  };

  const fetchStreetCount = async () => {
    if (!selectedDistrict) return;

    try {
      // Count segments in streets of this district
      const { data: streets } = await supabase
        .from("streets")
        .select("id")
        .eq("district_id", selectedDistrict);

      if (!streets || streets.length === 0) {
        setStreetCount(0);
        return;
      }

      const streetIds = streets.map(s => s.id);
      const { count } = await supabase
        .from("segments")
        .select("*", { count: "exact", head: true })
        .in("street_id", streetIds);

      setStreetCount(count || 0);
    } catch (error: any) {
      console.error("Error fetching street count:", error);
      setStreetCount(0);
    }
  };

  const handleAssignDistrict = async () => {
    if (!selectedDistrict || !campaignId) {
      toast.error("Veuillez sélectionner une zone");
      return;
    }

    if (assignType === "user" && !selectedVolunteer) {
      toast.error("Veuillez sélectionner un bénévole");
      return;
    }

    if (assignType === "team" && !selectedTeam) {
      toast.error("Veuillez sélectionner une équipe");
      return;
    }

    setLoading(true);

    try {
      // Get all streets in this district
      const { data: streets, error: streetsError } = await supabase
        .from("streets")
        .select("id")
        .eq("district_id", selectedDistrict);

      if (streetsError) throw streetsError;

      if (!streets || streets.length === 0) {
        toast.error("Aucune rue trouvée dans cette zone");
        setLoading(false);
        return;
      }

      const streetIds = streets.map(s => s.id);

      // Get all segments for these streets
      const { data: segments, error: segmentsError } = await supabase
        .from("segments")
        .select("id")
        .in("street_id", streetIds);

      if (segmentsError) throw segmentsError;

      if (!segments || segments.length === 0) {
        toast.error("Aucun segment trouvé dans cette zone");
        setLoading(false);
        return;
      }

      const segmentIds = segments.map(s => s.id);

      // Get existing campaign_segments
      const { data: existingCampaignSegments, error: existingError } = await supabase
        .from("campaign_segments")
        .select("segment_id")
        .eq("campaign_id", campaignId)
        .in("segment_id", segmentIds);

      if (existingError) throw existingError;

      const existingSegmentIds = new Set(existingCampaignSegments?.map(cs => cs.segment_id) || []);

      // Add missing segments to campaign
      const newSegments = segmentIds.filter(id => !existingSegmentIds.has(id));

      if (newSegments.length > 0) {
        const { error: insertError } = await supabase
          .from("campaign_segments")
          .insert(
            newSegments.map(segment_id => ({
              campaign_id: campaignId,
              segment_id,
              status: "todo" as "todo" | "in_progress" | "done" | "redo",
            }))
          );

        if (insertError) throw insertError;
      }

      // Now update all campaign_segments for this district
      const { error: updateError } = await supabase
        .from("campaign_segments")
        .update({
          assigned_to_user_id: assignType === "user" ? selectedVolunteer : null,
          assigned_to_team_id: assignType === "team" ? selectedTeam : null,
          status: "todo" as "todo" | "in_progress" | "done" | "redo",
        })
        .eq("campaign_id", campaignId)
        .in("segment_id", segmentIds);

      if (updateError) throw updateError;

      const assigneeName = assignType === "user"
        ? volunteers.find(v => v.id === selectedVolunteer)?.first_name
        : teams.find(t => t.id === selectedTeam)?.name;

      const districtName = districts.find(d => d.id === selectedDistrict)?.name;

      toast.success(`Zone "${districtName}" assignée à ${assigneeName} (${segmentIds.length} segments)`);

      // Reset form
      setSelectedDistrict("");
      setSelectedVolunteer("");
      setSelectedTeam("");
      setStreetCount(0);

      onAssignmentComplete();
    } catch (error: any) {
      toast.error("Erreur lors de l'assignation de la zone");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const selectedDistrictData = districts.find(d => d.id === selectedDistrict);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          Assignation par zones
        </CardTitle>
        <CardDescription>
          Assignez tous les segments d'une zone entière en une seule fois
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Zone</Label>
          <Select value={selectedDistrict} onValueChange={setSelectedDistrict}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionnez une zone" />
            </SelectTrigger>
            <SelectContent>
              {districts.map((district) => (
                <SelectItem key={district.id} value={district.id}>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: district.color }}
                    />
                    {district.name}
                    <Badge variant="secondary" className="ml-2">
                      {district.street_count} rue{(district.street_count || 0) > 1 ? "s" : ""}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedDistrictData && (
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: selectedDistrictData.color }}
              />
              <span className="font-semibold">{selectedDistrictData.name}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              📍 {selectedDistrictData.street_count} rue(s) • 📊 {streetCount} segment(s)
            </p>
          </div>
        )}

        <div className="space-y-4">
          <Label>Assigner à</Label>
          <Select value={assignType} onValueChange={(value: "user" | "team") => setAssignType(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4" />
                  Bénévole
                </div>
              </SelectItem>
              <SelectItem value="team">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Équipe
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {assignType === "user" ? (
          <div className="space-y-2">
            <Label>Bénévole</Label>
            <Select value={selectedVolunteer} onValueChange={setSelectedVolunteer}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez un bénévole" />
              </SelectTrigger>
              <SelectContent>
                {volunteers.map((volunteer) => (
                  <SelectItem key={volunteer.id} value={volunteer.id}>
                    {volunteer.first_name} {volunteer.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Équipe</Label>
            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez une équipe" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: team.color }}
                      />
                      {team.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button
          onClick={handleAssignDistrict}
          disabled={loading || !selectedDistrict || (assignType === "user" ? !selectedVolunteer : !selectedTeam)}
          className="w-full"
          size="lg"
        >
          {loading ? "Assignation en cours..." : `Assigner la zone (${streetCount} segments)`}
        </Button>
      </CardContent>
    </Card>
  );
};
