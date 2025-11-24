import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, Users, MapPin, Target, CheckCircle2, Circle, AlertCircle, Clock } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  status: string;
}

interface Segment {
  id: string;
  number_start: number;
  number_end: number;
  side: string;
  street: {
    name: string;
    type: string;
  };
}

interface CampaignSegment {
  id: string;
  segment_id: string;
  status: string;
  assigned_to_user_id: string | null;
  segment: Segment;
  assignedUser?: {
    first_name: string;
    last_name: string;
  };
}

interface Volunteer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

const Assignments = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [campaignSegments, setCampaignSegments] = useState<CampaignSegment[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<CampaignSegment | null>(null);
  const [selectedVolunteer, setSelectedVolunteer] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedCampaign) {
      fetchCampaignSegments();
    }
  }, [selectedCampaign]);

  const fetchInitialData = async () => {
    try {
      const [campaignsRes, volunteersRes] = await Promise.all([
        supabase.from("campaigns").select("id, name, status").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, first_name, last_name, email").order("first_name"),
      ]);

      if (campaignsRes.error) throw campaignsRes.error;
      if (volunteersRes.error) throw volunteersRes.error;

      setCampaigns(campaignsRes.data || []);
      setVolunteers(volunteersRes.data || []);
      
      // Auto-select first ongoing campaign
      const ongoingCampaign = campaignsRes.data?.find(c => c.status === "ongoing");
      if (ongoingCampaign) {
        setSelectedCampaign(ongoingCampaign.id);
      } else if (campaignsRes.data && campaignsRes.data.length > 0) {
        setSelectedCampaign(campaignsRes.data[0].id);
      }
    } catch (error: any) {
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  const fetchCampaignSegments = async () => {
    if (!selectedCampaign) return;

    try {
      const { data, error } = await supabase
        .from("campaign_segments")
        .select(`
          id,
          segment_id,
          status,
          assigned_to_user_id,
          segment:segments(
            id,
            number_start,
            number_end,
            side,
            street:streets(name, type)
          )
        `)
        .eq("campaign_id", selectedCampaign);

      if (error) throw error;

      // Fetch assigned users info
      const segmentsWithUsers = await Promise.all(
        (data || []).map(async (cs: any) => {
          if (cs.assigned_to_user_id) {
            const { data: userData } = await supabase
              .from("profiles")
              .select("first_name, last_name")
              .eq("id", cs.assigned_to_user_id)
              .single();
            
            return { ...cs, assignedUser: userData };
          }
          return cs;
        })
      );

      setCampaignSegments(segmentsWithUsers);
    } catch (error: any) {
      toast.error("Erreur lors du chargement des segments");
    }
  };

  const addSegmentsToCampaign = async () => {
    if (!selectedCampaign) return;

    try {
      // Get all segments
      const { data: allSegments, error: segmentsError } = await supabase
        .from("segments")
        .select("id");

      if (segmentsError) throw segmentsError;

      // Get existing campaign segments
      const { data: existingSegments, error: existingError } = await supabase
        .from("campaign_segments")
        .select("segment_id")
        .eq("campaign_id", selectedCampaign);

      if (existingError) throw existingError;

      const existingSegmentIds = new Set(existingSegments?.map(s => s.segment_id) || []);
      const newSegments = allSegments?.filter(s => !existingSegmentIds.has(s.id)) || [];

      if (newSegments.length === 0) {
        toast.info("Tous les segments sont déjà dans cette campagne");
        return;
      }

      const { error: insertError } = await supabase
        .from("campaign_segments")
        .insert(
          newSegments.map(s => ({
            campaign_id: selectedCampaign,
            segment_id: s.id,
            status: "todo" as "todo" | "in_progress" | "done" | "redo",
          }))
        );

      if (insertError) throw insertError;

      toast.success(`${newSegments.length} segment(s) ajouté(s) à la campagne`);
      fetchCampaignSegments();
    } catch (error: any) {
      toast.error("Erreur lors de l'ajout des segments");
    }
  };

  const handleAssign = async () => {
    if (!selectedSegment || !selectedVolunteer) return;

    try {
      const { error } = await supabase
        .from("campaign_segments")
        .update({
          assigned_to_user_id: selectedVolunteer,
          status: "todo",
        })
        .eq("id", selectedSegment.id);

      if (error) throw error;

      toast.success("Segment assigné avec succès");
      setAssignDialogOpen(false);
      setSelectedSegment(null);
      setSelectedVolunteer("");
      fetchCampaignSegments();
    } catch (error: any) {
      toast.error("Erreur lors de l'assignation");
    }
  };

  const handleUnassign = async (campaignSegmentId: string) => {
    if (!confirm("Retirer l'assignation de ce segment ?")) return;

    try {
      const { error } = await supabase
        .from("campaign_segments")
        .update({
          assigned_to_user_id: null,
          status: "todo",
        })
        .eq("id", campaignSegmentId);

      if (error) throw error;

      toast.success("Assignation retirée");
      fetchCampaignSegments();
    } catch (error: any) {
      toast.error("Erreur lors de la désassignation");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "done":
        return <CheckCircle2 className="w-4 h-4 text-success-green" />;
      case "in_progress":
        return <Clock className="w-4 h-4 text-status-in-progress" />;
      case "redo":
        return <AlertCircle className="w-4 h-4 text-warning-orange" />;
      default:
        return <Circle className="w-4 h-4 text-status-todo" />;
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
      <Badge variant={variants[status] || "outline"} className="text-xs">
        {labels[status] || status}
      </Badge>
    );
  };

  const getSideLabel = (side: string) => {
    const labels: Record<string, string> = {
      even: "Pairs",
      odd: "Impairs",
      both: "Les deux",
    };
    return labels[side] || side;
  };

  const filteredSegments = campaignSegments.filter(cs => {
    if (filterStatus === "all") return true;
    if (filterStatus === "unassigned") return !cs.assigned_to_user_id;
    if (filterStatus === "assigned") return !!cs.assigned_to_user_id;
    return cs.status === filterStatus;
  });

  const stats = {
    total: campaignSegments.length,
    assigned: campaignSegments.filter(cs => cs.assigned_to_user_id).length,
    unassigned: campaignSegments.filter(cs => !cs.assigned_to_user_id).length,
    done: campaignSegments.filter(cs => cs.status === "done").length,
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Assignation des segments</h1>
          <p className="text-muted-foreground">
            Assignez les segments aux bénévoles pour votre campagne
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total segments</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assignés</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.assigned}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Non assignés</CardTitle>
            <UserPlus className="h-4 w-4 text-warning-orange" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.unassigned}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Complétés</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success-green" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.done}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campagne et filtres</CardTitle>
          <CardDescription>
            Sélectionnez une campagne et filtrez les segments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-sm font-medium mb-2 block">Campagne</Label>
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez une campagne" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <Label className="text-sm font-medium mb-2 block">Filtrer par</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="unassigned">Non assignés</SelectItem>
                  <SelectItem value="assigned">Assignés</SelectItem>
                  <SelectItem value="todo">À faire</SelectItem>
                  <SelectItem value="in_progress">En cours</SelectItem>
                  <SelectItem value="done">Terminés</SelectItem>
                  <SelectItem value="redo">À refaire</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button onClick={addSegmentsToCampaign} variant="outline">
                <Target className="w-4 h-4 mr-2" />
                Ajouter tous les segments
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectedCampaign ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-center">
              Sélectionnez une campagne
            </p>
            <p className="text-sm text-muted-foreground text-center mt-2">
              Choisissez une campagne pour voir et assigner ses segments
            </p>
          </CardContent>
        </Card>
      ) : filteredSegments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-center">
              Aucun segment trouvé
            </p>
            <p className="text-sm text-muted-foreground text-center mt-2">
              Ajoutez des segments à cette campagne ou changez vos filtres
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredSegments.map((cs) => (
            <Card key={cs.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    {getStatusIcon(cs.status)}
                    <div className="flex-1">
                      <p className="font-medium">
                        {cs.segment.street.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        N° {cs.segment.number_start} à {cs.segment.number_end} • {getSideLabel(cs.segment.side)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {getStatusBadge(cs.status)}
                    
                    {cs.assigned_to_user_id ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {cs.assignedUser?.first_name} {cs.assignedUser?.last_name}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUnassign(cs.id)}
                        >
                          Retirer
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedSegment(cs);
                          setAssignDialogOpen(true);
                        }}
                      >
                        <UserPlus className="w-4 h-4 mr-2" />
                        Assigner
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assigner le segment</DialogTitle>
            <DialogDescription>
              {selectedSegment && (
                <>
                  {selectedSegment.segment.street.name} - N° {selectedSegment.segment.number_start} à{" "}
                  {selectedSegment.segment.number_end}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="volunteer">Sélectionnez un bénévole</Label>
              <Select value={selectedVolunteer} onValueChange={setSelectedVolunteer}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un bénévole" />
                </SelectTrigger>
                <SelectContent>
                  {volunteers.map((volunteer) => (
                    <SelectItem key={volunteer.id} value={volunteer.id}>
                      {volunteer.first_name} {volunteer.last_name} ({volunteer.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleAssign} disabled={!selectedVolunteer}>
                Assigner
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Label = ({ children, className, ...props }: any) => (
  <label className={className} {...props}>
    {children}
  </label>
);

export default Assignments;