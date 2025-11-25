import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Mail, CheckCircle2, Clock, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Invitation {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  invited_at: string;
  accepted_at: string | null;
  status: string;
}

const Invitations = () => {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
  });

  useEffect(() => {
    fetchInvitations();
  }, []);

  const fetchInvitations = async () => {
    try {
      const { data, error } = await supabase
        .from("volunteer_invitations")
        .select("*")
        .order("invited_at", { ascending: false });

      if (error) throw error;
      setInvitations(data || []);
    } catch (error: any) {
      toast.error("Erreur lors du chargement des invitations");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email) {
      toast.error("L'email est obligatoire");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("volunteer_invitations")
        .insert({
          email: formData.email.toLowerCase().trim(),
          first_name: formData.first_name || null,
          last_name: formData.last_name || null,
          phone: formData.phone || null,
          invited_by: user?.id,
        });

      if (error) throw error;

      toast.success("Invitation créée ! Le bénévole peut maintenant se connecter avec cet email.");
      setFormData({ email: "", first_name: "", last_name: "", phone: "" });
      setOpen(false);
      fetchInvitations();
    } catch (error: any) {
      if (error.code === "23505") {
        toast.error("Cette adresse email est déjà invitée");
      } else {
        toast.error("Erreur lors de la création de l'invitation");
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette invitation ?")) return;

    try {
      const { error } = await supabase
        .from("volunteer_invitations")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Invitation supprimée");
      fetchInvitations();
    } catch (error: any) {
      toast.error("Erreur lors de la suppression");
    }
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invitations Bénévoles</h1>
          <p className="text-muted-foreground">
            Pré-enregistrez les emails des bénévoles pour leur permettre de se connecter
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="gap-2">
              <Plus className="w-5 h-5" />
              Nouvelle invitation
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Inviter un bénévole</DialogTitle>
                <DialogDescription>
                  Entrez l'email du bénévole. Il pourra se connecter avec un lien magique envoyé par email.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="benevolat@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="first_name">Prénom</Label>
                  <Input
                    id="first_name"
                    placeholder="Jean"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Nom</Label>
                  <Input
                    id="last_name"
                    placeholder="Dupont"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Téléphone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="06 12 34 56 78"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit">Créer l'invitation</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {invitations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Mail className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-center">Aucune invitation</p>
              <p className="text-sm text-muted-foreground text-center mt-2">
                Créez votre première invitation pour permettre aux bénévoles de se connecter
              </p>
            </CardContent>
          </Card>
        ) : (
          invitations.map((invitation) => (
            <Card key={invitation.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="w-5 h-5" />
                      {invitation.email}
                    </CardTitle>
                    {(invitation.first_name || invitation.last_name) && (
                      <CardDescription className="mt-1">
                        {invitation.first_name} {invitation.last_name}
                      </CardDescription>
                    )}
                  </div>
                  <Badge variant={invitation.status === "accepted" ? "default" : "secondary"}>
                    {invitation.status === "accepted" ? (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Acceptée
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        En attente
                      </span>
                    )}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground space-y-1">
                    {invitation.phone && <p>📞 {invitation.phone}</p>}
                    <p>
                      Invité le {new Date(invitation.invited_at).toLocaleDateString("fr-FR")}
                    </p>
                    {invitation.accepted_at && (
                      <p className="text-green-600">
                        Connecté le {new Date(invitation.accepted_at).toLocaleDateString("fr-FR")}
                      </p>
                    )}
                  </div>
                  {invitation.status !== "accepted" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(invitation.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default Invitations;
