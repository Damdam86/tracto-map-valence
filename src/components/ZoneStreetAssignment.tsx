import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Check, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface Street {
  id: string;
  name: string;
  type: string;
  district: string;
  neighborhood: string;
  district_id: string | null;
}

interface District {
  id: string;
  name: string;
  color: string;
}

const ZoneStreetAssignment = () => {
  const [streets, setStreets] = useState<Street[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [selectedStreets, setSelectedStreets] = useState<Set<string>>(new Set());
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch all streets
      const { data: streetsData, error: streetsError } = await supabase
        .from("streets")
        .select("*")
        .not('coordinates', 'is', null)
        .order("name");

      if (streetsError) throw streetsError;
      setStreets(streetsData || []);

      // Fetch districts
      const { data: districtsData, error: districtsError } = await supabase
        .from("districts")
        .select("id, name, color")
        .order("name");

      if (districtsError) throw districtsError;
      setDistricts(districtsData || []);
    } catch (error: any) {
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  const toggleStreetSelection = (streetId: string, event: React.MouseEvent) => {
    const newSelection = new Set(selectedStreets);

    if (event.ctrlKey || event.metaKey) {
      // CTRL/CMD+Click: Toggle individual selection
      if (newSelection.has(streetId)) {
        newSelection.delete(streetId);
      } else {
        newSelection.add(streetId);
      }
    } else {
      // Regular click: Select only this one
      if (newSelection.has(streetId) && newSelection.size === 1) {
        newSelection.clear();
      } else {
        newSelection.clear();
        newSelection.add(streetId);
      }
    }

    setSelectedStreets(newSelection);
  };

  const handleBulkAssign = async () => {
    if (selectedStreets.size === 0) {
      toast.error("Veuillez sélectionner au moins une rue");
      return;
    }

    if (!selectedDistrict) {
      toast.error("Veuillez sélectionner une zone");
      return;
    }

    try {
      const updates = Array.from(selectedStreets).map((streetId) => ({
        id: streetId,
        district_id: selectedDistrict === "none" ? null : selectedDistrict,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("streets")
          .update({ district_id: update.district_id })
          .eq("id", update.id);

        if (error) throw error;
      }

      toast.success(`${selectedStreets.size} rue${selectedStreets.size > 1 ? 's assignées' : ' assignée'}`);
      setSelectedStreets(new Set());
      setSelectedDistrict("");
      fetchData();
    } catch (error: any) {
      toast.error("Erreur lors de l'assignation");
    }
  };

  const selectAll = () => {
    setSelectedStreets(new Set(filteredStreets.map(s => s.id)));
  };

  const deselectAll = () => {
    setSelectedStreets(new Set());
  };

  const selectByDistrict = (districtId: string | null) => {
    const streetsInDistrict = filteredStreets.filter(s => s.district_id === districtId);
    setSelectedStreets(new Set(streetsInDistrict.map(s => s.id)));
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

  const getDistrictName = (districtId: string | null) => {
    if (!districtId) return "Non assignée";
    const district = districts.find(d => d.id === districtId);
    return district?.name || "Inconnue";
  };

  const getDistrictColor = (districtId: string | null) => {
    if (!districtId) return "#9ca3af";
    const district = districts.find(d => d.id === districtId);
    return district?.color || "#9ca3af";
  };

  const filteredStreets = streets.filter(street =>
    street.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Assignation rapide des rues aux zones</CardTitle>
          <CardDescription>
            Sélectionnez plusieurs rues (CTRL+clic ou ⌘+clic) et assignez-les à une zone en un clic
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[200px] space-y-2">
              <Label htmlFor="zone-select">Zone de destination</Label>
              <Select value={selectedDistrict} onValueChange={setSelectedDistrict}>
                <SelectTrigger id="zone-select">
                  <SelectValue placeholder="Sélectionnez une zone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune zone (désassigner)</SelectItem>
                  {districts.map((district) => (
                    <SelectItem key={district.id} value={district.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full inline-block"
                          style={{ backgroundColor: district.color }}
                        />
                        {district.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleBulkAssign}
              disabled={selectedStreets.size === 0 || !selectedDistrict}
              size="lg"
            >
              <Check className="w-4 h-4 mr-2" />
              Assigner {selectedStreets.size > 0 && `(${selectedStreets.size})`}
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Tout sélectionner
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAll}>
              Tout désélectionner
            </Button>
            <div className="border-l mx-2"></div>
            {districts.map((district) => (
              <Button
                key={district.id}
                variant="outline"
                size="sm"
                onClick={() => selectByDistrict(district.id)}
              >
                <span
                  className="w-3 h-3 rounded-full inline-block mr-1"
                  style={{ backgroundColor: district.color }}
                />
                Sélectionner {district.name}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectByDistrict(null)}
            >
              Sélectionner non assignées
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="search">Rechercher une rue</Label>
            <Input
              id="search"
              placeholder="Filtrer par nom de rue..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filteredStreets.length} rue{filteredStreets.length > 1 ? 's' : ''}
            {selectedStreets.size > 0 && ` • ${selectedStreets.size} sélectionnée${selectedStreets.size > 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="border rounded-lg divide-y max-h-[600px] overflow-y-auto">
          {filteredStreets.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Aucune rue trouvée
            </div>
          ) : (
            filteredStreets.map((street) => {
              const isSelected = selectedStreets.has(street.id);
              return (
                <div
                  key={street.id}
                  onClick={(e) => toggleStreetSelection(street.id, e)}
                  className={`
                    p-4 cursor-pointer transition-colors
                    ${isSelected ? 'bg-primary/10 border-l-4 border-l-primary' : 'hover:bg-muted/50'}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`
                        w-5 h-5 rounded border-2 flex items-center justify-center
                        ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'}
                      `}>
                        {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium">
                          {getTypeLabel(street.type)} {street.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {street.district && `${street.district}`}
                          {street.neighborhood && ` • ${street.neighborhood}`}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className="ml-4"
                      style={{
                        borderLeft: `4px solid ${getDistrictColor(street.district_id)}`,
                      }}
                    >
                      {getDistrictName(street.district_id)}
                    </Badge>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg">
        <p className="font-medium mb-2">💡 Astuces :</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Cliquez sur une rue pour la sélectionner</li>
          <li>Maintenez CTRL (ou ⌘ sur Mac) + clic pour sélectionner plusieurs rues</li>
          <li>Utilisez les boutons de sélection rapide pour sélectionner toutes les rues d'une zone</li>
          <li>Vous pouvez filtrer les rues avec la barre de recherche</li>
        </ul>
      </div>
    </div>
  );
};

export default ZoneStreetAssignment;
