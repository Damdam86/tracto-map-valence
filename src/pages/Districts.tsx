import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, MapPin, Trash2, Edit, List } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import ZoneStreetAssignment from "@/components/ZoneStreetAssignment";

interface District {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
  street_count?: number;
}

const Districts = () => {
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingDistrict, setEditingDistrict] = useState<District | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: "#3b82f6",
  });

  useEffect(() => {
    fetchDistricts();
  }, []);

  const fetchDistricts = async () => {
    try {
      // Fetch districts
      const { data: districtsData, error: districtsError } = await supabase
        .from("districts")
        .select("*")
        .order("name");

      if (districtsError) throw districtsError;

      // Fetch street counts for each district
      const districtsWithCounts = await Promise.all(
        (districtsData || []).map(async (district) => {
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
    } catch (error: any) {
      toast.error("Erreur lors du chargement des zones");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast.error("Le nom est obligatoire");
      return;
    }

    try {
      if (editingDistrict) {
        const { error } = await supabase
          .from("districts")
          .update({
            name: formData.name,
            description: formData.description || null,
            color: formData.color,
          })
          .eq("id", editingDistrict.id);

        if (error) throw error;
        toast.success("Zone modifiée");
      } else {
        const { error } = await supabase
          .from("districts")
          .insert({
            name: formData.name,
            description: formData.description || null,
            color: formData.color,
          });

        if (error) throw error;
        toast.success("Zone créée");
      }

      setFormData({ name: "", description: "", color: "#3b82f6" });
      setEditingDistrict(null);
      setOpen(false);
      fetchDistricts();
    } catch (error: any) {
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  const handleEdit = (district: District) => {
    setEditingDistrict(district);
    setFormData({
      name: district.name,
      description: district.description || "",
      color: district.color,
    });
    setOpen(true);
  };

  const handleDelete = async (id: string, streetCount: number) => {
    if (streetCount > 0) {
      toast.error("Impossible de supprimer une zone contenant des rues");
      return;
    }

    if (!confirm("Êtes-vous sûr de vouloir supprimer cette zone ?")) return;

    try {
      const { error } = await supabase
        .from("districts")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Zone supprimée");
      fetchDistricts();
    } catch (error: any) {
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setEditingDistrict(null);
      setFormData({ name: "", description: "", color: "#3b82f6" });
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Zones de tractage</h1>
        <p className="text-muted-foreground">
          Organisez les rues en zones pour faciliter les assignations
        </p>
      </div>

      <Tabs defaultValue="zones" className="space-y-6">
        <TabsList>
          <TabsTrigger value="zones" className="gap-2">
            <MapPin className="w-4 h-4" />
            Gérer les zones
          </TabsTrigger>
          <TabsTrigger value="assign" className="gap-2">
            <List className="w-4 h-4" />
            Assigner les rues
          </TabsTrigger>
        </TabsList>

        <TabsContent value="zones" className="space-y-6">
          <div className="flex justify-end">
            <Dialog open={open} onOpenChange={handleOpenChange}>
              <DialogTrigger asChild>
                <Button size="lg" className="gap-2">
                  <Plus className="w-5 h-5" />
                  Nouvelle zone
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <form onSubmit={handleSubmit}>
                  <DialogHeader>
                    <DialogTitle>
                      {editingDistrict ? "Modifier la zone" : "Créer une zone"}
                    </DialogTitle>
                    <DialogDescription>
                      Les zones permettent de regrouper les rues pour faciliter les assignations
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nom de la zone *</Label>
                      <Input
                        id="name"
                        placeholder="Zone Centre"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Secteur comprenant..."
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="color">Couleur</Label>
                      <div className="flex gap-2">
                        <Input
                          id="color"
                          type="color"
                          value={formData.color}
                          onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                          className="w-20 h-10"
                        />
                        <Input
                          type="text"
                          value={formData.color}
                          onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                          placeholder="#3b82f6"
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                      Annuler
                    </Button>
                    <Button type="submit">
                      {editingDistrict ? "Modifier" : "Créer"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {districts.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <MapPin className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium text-center">Aucune zone</p>
                  <p className="text-sm text-muted-foreground text-center mt-2">
                    Créez votre première zone pour organiser vos rues
                  </p>
                </CardContent>
              </Card>
            ) : (
              districts.map((district) => (
                <Card key={district.id} className="relative overflow-hidden">
                  <div
                    className="absolute top-0 left-0 right-0 h-2"
                    style={{ backgroundColor: district.color }}
                  />
                  <CardHeader className="pt-6">
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <MapPin className="w-5 h-5" style={{ color: district.color }} />
                        {district.name}
                      </span>
                      <Badge variant="secondary">
                        {district.street_count} rue{district.street_count !== 1 ? "s" : ""}
                      </Badge>
                    </CardTitle>
                    {district.description && (
                      <CardDescription className="mt-2">
                        {district.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleEdit(district)}
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Modifier
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(district.id, district.street_count || 0)}
                        disabled={(district.street_count || 0) > 0}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="assign">
          <ZoneStreetAssignment />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Districts;
