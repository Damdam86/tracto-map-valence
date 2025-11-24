import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Map, Trash2, Edit, MapPin } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface Street {
  id: string;
  name: string;
  type: string;
  district: string;
  neighborhood: string;
}

interface Segment {
  id: string;
  street_id: string;
  number_start: number;
  number_end: number;
  side: string;
  building_type: string;
  notes: string;
}

const Streets = () => {
  const [streets, setStreets] = useState<Street[]>([]);
  const [segments, setSegments] = useState<Record<string, Segment[]>>({});
  const [loading, setLoading] = useState(true);
  const [streetDialogOpen, setStreetDialogOpen] = useState(false);
  const [segmentDialogOpen, setSegmentDialogOpen] = useState(false);
  const [selectedStreetId, setSelectedStreetId] = useState<string>("");
  const [editingStreet, setEditingStreet] = useState<Street | null>(null);
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null);

  const [streetFormData, setStreetFormData] = useState({
    name: "",
    type: "street" as "street" | "avenue" | "impasse" | "boulevard" | "place" | "chemin" | "route",
    district: "",
    neighborhood: "",
  });

  const [segmentFormData, setSegmentFormData] = useState({
    street_id: "",
    number_start: "",
    number_end: "",
    side: "both" as "even" | "odd" | "both",
    building_type: "mixed" as "houses" | "buildings" | "mixed",
    notes: "",
  });

  useEffect(() => {
    fetchStreets();
  }, []);

  const fetchStreets = async () => {
    try {
      const { data, error } = await supabase
        .from("streets")
        .select("*")
        .order("name");

      if (error) throw error;
      setStreets(data || []);

      // Fetch segments for each street
      if (data) {
        const segmentsData: Record<string, Segment[]> = {};
        for (const street of data) {
          const { data: streetSegments } = await supabase
            .from("segments")
            .select("*")
            .eq("street_id", street.id)
            .order("number_start");
          
          segmentsData[street.id] = streetSegments || [];
        }
        setSegments(segmentsData);
      }
    } catch (error: any) {
      toast.error("Erreur lors du chargement des rues");
    } finally {
      setLoading(false);
    }
  };

  const handleStreetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingStreet) {
        const { error } = await supabase
          .from("streets")
          .update(streetFormData)
          .eq("id", editingStreet.id);

        if (error) throw error;
        toast.success("Rue mise à jour");
      } else {
        const { error } = await supabase
          .from("streets")
          .insert(streetFormData);

        if (error) throw error;
        toast.success("Rue créée");
      }

      setStreetDialogOpen(false);
      setEditingStreet(null);
      setStreetFormData({
        name: "",
        type: "street",
        district: "",
        neighborhood: "",
      });
      fetchStreets();
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'enregistrement");
    }
  };

  const handleSegmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const data = {
        street_id: segmentFormData.street_id,
        number_start: parseInt(segmentFormData.number_start),
        number_end: parseInt(segmentFormData.number_end),
        side: segmentFormData.side,
        building_type: segmentFormData.building_type,
        notes: segmentFormData.notes,
      };

      if (editingSegment) {
        const { error } = await supabase
          .from("segments")
          .update(data)
          .eq("id", editingSegment.id);

        if (error) throw error;
        toast.success("Segment mis à jour");
      } else {
        const { error } = await supabase
          .from("segments")
          .insert(data);

        if (error) throw error;
        toast.success("Segment créé");
      }

      setSegmentDialogOpen(false);
      setEditingSegment(null);
      setSegmentFormData({
        street_id: "",
        number_start: "",
        number_end: "",
        side: "both",
        building_type: "mixed",
        notes: "",
      });
      fetchStreets();
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'enregistrement");
    }
  };

  const handleDeleteStreet = async (id: string) => {
    if (!confirm("Supprimer cette rue et tous ses segments ?")) return;

    try {
      const { error } = await supabase
        .from("streets")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Rue supprimée");
      fetchStreets();
    } catch (error: any) {
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleDeleteSegment = async (id: string) => {
    if (!confirm("Supprimer ce segment ?")) return;

    try {
      const { error } = await supabase
        .from("segments")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Segment supprimé");
      fetchStreets();
    } catch (error: any) {
      toast.error("Erreur lors de la suppression");
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      street: "Rue",
      avenue: "Avenue",
      impasse: "Impasse",
      boulevard: "Boulevard",
      place: "Place",
      chemin: "Chemin",
      route: "Route",
    };
    return labels[type] || type;
  };

  const getSideLabel = (side: string) => {
    const labels: Record<string, string> = {
      even: "Pairs",
      odd: "Impairs",
      both: "Les deux",
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rues & Segments</h1>
          <p className="text-muted-foreground">
            Gérez les rues et leurs segments de distribution
          </p>
        </div>
        <Dialog open={streetDialogOpen} onOpenChange={setStreetDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingStreet(null);
              setStreetFormData({
                name: "",
                type: "street",
                district: "",
                neighborhood: "",
              });
            }}>
              <Plus className="w-4 h-4 mr-2" />
              Nouvelle rue
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingStreet ? "Modifier la rue" : "Nouvelle rue"}
              </DialogTitle>
              <DialogDescription>
                Informations sur la rue
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleStreetSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom de la rue *</Label>
                <Input
                  id="name"
                  value={streetFormData.name}
                  onChange={(e) => setStreetFormData({ ...streetFormData, name: e.target.value })}
                  placeholder="Ex: Rue de la République"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  value={streetFormData.type}
                  onValueChange={(value: any) => setStreetFormData({ ...streetFormData, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="street">Rue</SelectItem>
                    <SelectItem value="avenue">Avenue</SelectItem>
                    <SelectItem value="boulevard">Boulevard</SelectItem>
                    <SelectItem value="place">Place</SelectItem>
                    <SelectItem value="impasse">Impasse</SelectItem>
                    <SelectItem value="chemin">Chemin</SelectItem>
                    <SelectItem value="route">Route</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="district">Quartier</Label>
                  <Input
                    id="district"
                    value={streetFormData.district}
                    onChange={(e) => setStreetFormData({ ...streetFormData, district: e.target.value })}
                    placeholder="Centre"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="neighborhood">Secteur</Label>
                  <Input
                    id="neighborhood"
                    value={streetFormData.neighborhood}
                    onChange={(e) => setStreetFormData({ ...streetFormData, neighborhood: e.target.value })}
                    placeholder="Centre-ville"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setStreetDialogOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit">
                  {editingStreet ? "Mettre à jour" : "Créer"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {streets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Map className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-center">
              Aucune rue enregistrée
            </p>
            <p className="text-sm text-muted-foreground text-center mt-2">
              Commencez par créer les rues de votre ville
            </p>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {streets.map((street) => (
            <AccordionItem key={street.id} value={street.id} className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between flex-1 mr-4">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-primary" />
                    <div className="text-left">
                      <p className="font-semibold">{getTypeLabel(street.type)} {street.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {street.district} {street.neighborhood && `• ${street.neighborhood}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {segments[street.id]?.length || 0} segment(s)
                    </span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-medium">Segments</h4>
                    <div className="flex gap-2">
                      <Dialog open={segmentDialogOpen} onOpenChange={setSegmentDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingSegment(null);
                              setSegmentFormData({
                                street_id: street.id,
                                number_start: "",
                                number_end: "",
                                side: "both",
                                building_type: "mixed",
                                notes: "",
                              });
                            }}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Ajouter segment
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>
                              {editingSegment ? "Modifier le segment" : "Nouveau segment"}
                            </DialogTitle>
                            <DialogDescription>
                              Pour {getTypeLabel(street.type)} {street.name}
                            </DialogDescription>
                          </DialogHeader>
                          <form onSubmit={handleSegmentSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="number_start">N° début *</Label>
                                <Input
                                  id="number_start"
                                  type="number"
                                  value={segmentFormData.number_start}
                                  onChange={(e) => setSegmentFormData({ ...segmentFormData, number_start: e.target.value })}
                                  required
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="number_end">N° fin *</Label>
                                <Input
                                  id="number_end"
                                  type="number"
                                  value={segmentFormData.number_end}
                                  onChange={(e) => setSegmentFormData({ ...segmentFormData, number_end: e.target.value })}
                                  required
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="side">Côté</Label>
                                <Select
                                  value={segmentFormData.side}
                                  onValueChange={(value: any) => setSegmentFormData({ ...segmentFormData, side: value })}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="both">Les deux côtés</SelectItem>
                                    <SelectItem value="even">Pairs uniquement</SelectItem>
                                    <SelectItem value="odd">Impairs uniquement</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="building_type">Type</Label>
                                <Select
                                  value={segmentFormData.building_type}
                                  onValueChange={(value: any) => setSegmentFormData({ ...segmentFormData, building_type: value })}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="mixed">Mixte</SelectItem>
                                    <SelectItem value="houses">Maisons</SelectItem>
                                    <SelectItem value="buildings">Immeubles</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="notes">Notes</Label>
                              <Textarea
                                id="notes"
                                value={segmentFormData.notes}
                                onChange={(e) => setSegmentFormData({ ...segmentFormData, notes: e.target.value })}
                                placeholder="Informations complémentaires..."
                                rows={2}
                              />
                            </div>

                            <div className="flex justify-end gap-2">
                              <Button type="button" variant="outline" onClick={() => setSegmentDialogOpen(false)}>
                                Annuler
                              </Button>
                              <Button type="submit">
                                {editingSegment ? "Mettre à jour" : "Créer"}
                              </Button>
                            </div>
                          </form>
                        </DialogContent>
                      </Dialog>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingStreet(street);
                          setStreetFormData({
                            name: street.name,
                            type: street.type as any,
                            district: street.district || "",
                            neighborhood: street.neighborhood || "",
                          });
                          setStreetDialogOpen(true);
                        }}
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteStreet(street.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  {segments[street.id]?.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Aucun segment défini pour cette rue
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {segments[street.id]?.map((segment) => (
                        <div key={segment.id} className="flex items-center justify-between p-3 bg-muted rounded-md">
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              N° {segment.number_start} à {segment.number_end} • {getSideLabel(segment.side)}
                            </p>
                            {segment.notes && (
                              <p className="text-xs text-muted-foreground mt-1">{segment.notes}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingSegment(segment);
                                setSegmentFormData({
                                  street_id: segment.street_id,
                                  number_start: segment.number_start.toString(),
                                  number_end: segment.number_end.toString(),
                                  side: segment.side as any,
                                  building_type: segment.building_type as any,
                                  notes: segment.notes || "",
                                });
                                setSegmentDialogOpen(true);
                              }}
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteSegment(segment.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
};

export default Streets;