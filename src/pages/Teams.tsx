import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Users as UsersIcon, Trash2, Edit, UserPlus, UserMinus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Team {
  id: string;
  name: string;
  description: string;
  color: string;
  created_at: string;
}

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  profiles: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

const Teams = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember[]>>({});
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: "#3b82f6",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [teamsRes, usersRes] = await Promise.all([
        supabase.from("teams").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("*").order("first_name"),
      ]);

      if (teamsRes.error) throw teamsRes.error;
      if (usersRes.error) throw usersRes.error;

      setTeams(teamsRes.data || []);
      setAllUsers(usersRes.data || []);

      // Fetch members for each team
      if (teamsRes.data) {
        const membersData: Record<string, TeamMember[]> = {};
        for (const team of teamsRes.data) {
          const { data: members } = await supabase
            .from("team_members")
            .select("id, user_id, role")
            .eq("team_id", team.id);
          
          // Fetch user profiles separately
          const membersWithProfiles = await Promise.all(
            (members || []).map(async (member) => {
              const { data: profile } = await supabase
                .from("profiles")
                .select("first_name, last_name, email")
                .eq("id", member.user_id)
                .single();
              
              return {
                ...member,
                profiles: profile || { first_name: "", last_name: "", email: "" }
              };
            })
          );
          
          membersData[team.id] = membersWithProfiles;
        }
        setTeamMembers(membersData);
      }
    } catch (error: any) {
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingTeam) {
        const { error } = await supabase
          .from("teams")
          .update(formData)
          .eq("id", editingTeam.id);

        if (error) throw error;
        toast.success("Équipe mise à jour");
      } else {
        const { error } = await supabase
          .from("teams")
          .insert(formData);

        if (error) throw error;
        toast.success("Équipe créée");
      }

      setDialogOpen(false);
      setEditingTeam(null);
      setFormData({ name: "", description: "", color: "#3b82f6" });
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'enregistrement");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette équipe ?")) return;

    try {
      const { error } = await supabase
        .from("teams")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Équipe supprimée");
      fetchData();
    } catch (error: any) {
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleAddMember = async () => {
    if (!selectedTeam || !selectedUserId) return;

    try {
      const { error } = await supabase
        .from("team_members")
        .insert({
          team_id: selectedTeam.id,
          user_id: selectedUserId,
          role: "member",
        });

      if (error) throw error;

      toast.success("Membre ajouté");
      setMemberDialogOpen(false);
      setSelectedUserId("");
      fetchData();
    } catch (error: any) {
      toast.error("Erreur lors de l'ajout");
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("Retirer ce membre de l'équipe ?")) return;

    try {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("id", memberId);

      if (error) throw error;
      toast.success("Membre retiré");
      fetchData();
    } catch (error: any) {
      toast.error("Erreur lors de la suppression");
    }
  };

  const getAvailableUsers = (teamId: string) => {
    const existingMemberIds = new Set(teamMembers[teamId]?.map(m => m.user_id) || []);
    return allUsers.filter(u => !existingMemberIds.has(u.id));
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
          <h1 className="text-3xl font-bold tracking-tight">Équipes</h1>
          <p className="text-muted-foreground">
            Gérez les équipes de bénévoles pour le tractage
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingTeam(null);
              setFormData({ name: "", description: "", color: "#3b82f6" });
            }}>
              <Plus className="w-4 h-4 mr-2" />
              Nouvelle équipe
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingTeam ? "Modifier l'équipe" : "Nouvelle équipe"}
              </DialogTitle>
              <DialogDescription>
                Créez une équipe pour organiser vos bénévoles
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom de l'équipe *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Équipe Centre-ville"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Décrivez l'équipe..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="color">Couleur de l'équipe</Label>
                <div className="flex gap-2">
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-20 h-10"
                  />
                  <Input
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="#3b82f6"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit">
                  {editingTeam ? "Mettre à jour" : "Créer"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UsersIcon className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-center">
              Aucune équipe créée
            </p>
            <p className="text-sm text-muted-foreground text-center mt-2">
              Créez votre première équipe pour organiser vos bénévoles
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {teams.map((team) => (
            <Card key={team.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: team.color }}
                    />
                    <div>
                      <CardTitle>{team.name}</CardTitle>
                      <CardDescription>{team.description}</CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingTeam(team);
                        setFormData({
                          name: team.name,
                          description: team.description || "",
                          color: team.color,
                        });
                        setDialogOpen(true);
                      }}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(team.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Membres ({teamMembers[team.id]?.length || 0})
                    </p>
                    <Dialog open={memberDialogOpen && selectedTeam?.id === team.id} onOpenChange={(open) => {
                      setMemberDialogOpen(open);
                      if (!open) setSelectedTeam(null);
                    }}>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedTeam(team)}
                        >
                          <UserPlus className="w-3 h-3 mr-1" />
                          Ajouter membre
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Ajouter un membre</DialogTitle>
                          <DialogDescription>
                            Ajoutez un bénévole à l'équipe {team.name}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Sélectionnez un bénévole</Label>
                            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                              <SelectTrigger>
                                <SelectValue placeholder="Choisir un bénévole" />
                              </SelectTrigger>
                              <SelectContent>
                                {getAvailableUsers(team.id).map((user) => (
                                  <SelectItem key={user.id} value={user.id}>
                                    {user.first_name} {user.last_name} ({user.email})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setMemberDialogOpen(false)}>
                              Annuler
                            </Button>
                            <Button onClick={handleAddMember} disabled={!selectedUserId}>
                              Ajouter
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  <div className="space-y-2">
                    {teamMembers[team.id]?.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Aucun membre dans cette équipe
                      </p>
                    ) : (
                      teamMembers[team.id]?.map((member) => (
                        <div key={member.id} className="flex items-center justify-between p-2 bg-muted rounded-md">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {member.profiles.first_name} {member.profiles.last_name}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {member.profiles.email}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveMember(member.id)}
                          >
                            <UserMinus className="w-3 h-3" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Teams;