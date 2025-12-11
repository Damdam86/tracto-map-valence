import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Check, MapPin, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface Street {
  id: string;
  name: string;
  type: string;
  district_id: string | null;
  coordinates: number[][] | number[][][] | null;
}

interface District {
  id: string;
  name: string;
  color: string;
}

const UNASSIGNED_COLOR = "#94a3b8"; // Gray for unassigned streets
const SELECTED_COLOR = "#facc15"; // Yellow for selected streets

const ZoneMapAssignment = () => {
  const [streets, setStreets] = useState<Street[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [selectedStreets, setSelectedStreets] = useState<Set<string>>(new Set());
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<L.Map | null>(null);
  const polylinesRef = useRef<Map<string, L.Polyline[]>>(new Map()); // Map street ID to polylines

  const center: [number, number] = [44.8771, 4.8772]; // Portes-lès-Valence
  const defaultZoom = 15;

  const mapContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      return;
    }

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(node).setView(center, defaultZoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    // Add info control
    const InfoControl = L.Control.extend({
      onAdd: function () {
        const div = L.DomUtil.create('div', 'leaflet-control-info');
        div.style.padding = '10px';
        div.style.background = 'white';
        div.style.borderRadius = '5px';
        div.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        div.innerHTML = '<h4 style="margin: 0 0 5px 0;">Sélection</h4><p id="info-content" style="margin: 0; font-size: 12px;">Cliquez sur les rues pour les sélectionner</p>';
        return div;
      }
    });

    new InfoControl({ position: 'topright' }).addTo(map);

    mapRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!mapRef.current || streets.length === 0) return;
    renderStreets();
  }, [streets, selectedStreets]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // First check total streets count
      const { count: totalStreets } = await supabase
        .from("streets")
        .select("*", { count: 'exact', head: true });

      // Fetch all streets with coordinates
      const { data: streetsData, error: streetsError } = await supabase
        .from("streets")
        .select("id, name, type, district_id, coordinates")
        .not('coordinates', 'is', null)
        .order("name");

      if (streetsError) throw streetsError;

      console.log(`Total streets in DB: ${totalStreets}, Streets with coordinates: ${streetsData?.length || 0}`);

      if (!streetsData || streetsData.length === 0) {
        if (totalStreets && totalStreets > 0) {
          toast.info(`Aucune rue avec coordonnées GPS trouvée. Utilisez "Import rues" pour importer les coordonnées depuis OpenStreetMap.`, {
            duration: 5000,
          });
        } else {
          toast.info("Aucune rue trouvée dans la base de données.");
        }
      }

      setStreets(streetsData || []);

      // Fetch districts
      const { data: districtsData, error: districtsError } = await supabase
        .from("districts")
        .select("id, name, color")
        .order("name");

      if (districtsError) throw districtsError;
      setDistricts(districtsData || []);
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  const renderStreets = () => {
    if (!mapRef.current) return;

    console.log(`🗺️ Rendering ${streets.length} streets on map`);

    // Remove all existing polylines
    polylinesRef.current.forEach((polylines) => {
      polylines.forEach(p => {
        if (mapRef.current) {
          mapRef.current.removeLayer(p);
        }
      });
    });
    polylinesRef.current.clear();

    // Update info control
    const infoContent = document.getElementById('info-content');
    if (infoContent) {
      const assignedCount = streets.filter(s => s.district_id).length;
      const unassignedCount = streets.filter(s => !s.district_id).length;

      infoContent.innerHTML = `
        <strong>${streets.length} rues</strong><br/>
        <span style="color: #22c55e">● ${assignedCount} assignées</span><br/>
        <span style="color: ${UNASSIGNED_COLOR}">● ${unassignedCount} non assignées</span><br/>
        ${selectedStreets.size > 0 ? `<br/><strong style="color: ${SELECTED_COLOR}">● ${selectedStreets.size} sélectionnée(s)</strong>` : ''}
      `;
    }

    const allPolylines: L.Polyline[] = [];
    let renderedCount = 0;
    let errorCount = 0;

    streets.forEach((street) => {
      if (!mapRef.current || !street.coordinates) {
        if (!street.coordinates) {
          console.warn(`⚠️ Street "${street.name}" has no coordinates`);
        }
        return;
      }

      try {
        const coords = street.coordinates;
        const isMultiLineString = Array.isArray(coords[0]) && Array.isArray(coords[0][0]);

        const isSelected = selectedStreets.has(street.id);
        const district = districts.find(d => d.id === street.district_id);
        const color = isSelected ? SELECTED_COLOR : (district?.color || UNASSIGNED_COLOR);

        const polylineOptions = {
          color,
          weight: isSelected ? 7 : 5,
          opacity: isSelected ? 1 : 0.7,
        };

        const zoneName = district?.name || "Non assignée";
        const tooltipText = `<strong>${street.name}</strong><br/>Zone: ${zoneName}${isSelected ? '<br/><em>Sélectionnée</em>' : ''}`;

        const streetPolylines: L.Polyline[] = [];

        if (isMultiLineString) {
          const ways = coords as number[][][];
          ways.forEach((way) => {
            const line: [number, number][] = way.map(coord => [coord[0], coord[1]]);
            const polyline = L.polyline(line, polylineOptions).addTo(mapRef.current!);
            polyline.bindTooltip(tooltipText, { direction: 'top' });

            // Add click event
            polyline.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
              toggleStreetSelection(street.id, e.originalEvent as MouseEvent);
            });

            streetPolylines.push(polyline);
            allPolylines.push(polyline);
          });
        } else {
          const line: [number, number][] = (coords as number[][]).map(coord => [coord[0], coord[1]]);
          const polyline = L.polyline(line, polylineOptions).addTo(mapRef.current!);
          polyline.bindTooltip(tooltipText, { direction: 'top' });

          polyline.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            toggleStreetSelection(street.id, e.originalEvent as MouseEvent);
          });

          streetPolylines.push(polyline);
          allPolylines.push(polyline);
        }

        polylinesRef.current.set(street.id, streetPolylines);
        renderedCount++;
      } catch (error) {
        console.error(`❌ Erreur lors de l'ajout de la rue ${street.name}:`, error);
        errorCount++;
      }
    });

    console.log(`✅ Rendered ${renderedCount} streets, ${errorCount} errors, ${allPolylines.length} total polylines`);

    // Fit bounds to show all streets
    if (allPolylines.length > 0 && mapRef.current) {
      try {
        const group = L.featureGroup(allPolylines);
        mapRef.current.fitBounds(group.getBounds().pad(0.1));
        console.log(`📍 Map centered on ${allPolylines.length} polylines`);
      } catch (error) {
        console.error('❌ Erreur lors du centrage de la carte:', error);
      }
    } else {
      console.warn(`⚠️ No polylines to display on map (streets: ${streets.length}, allPolylines: ${allPolylines.length})`);
    }
  };

  const toggleStreetSelection = (streetId: string, event: MouseEvent) => {
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

  const selectByDistrict = (districtId: string | null) => {
    const streetsInDistrict = streets.filter(s => s.district_id === districtId);
    setSelectedStreets(new Set(streetsInDistrict.map(s => s.id)));
  };

  const selectAll = () => {
    setSelectedStreets(new Set(streets.map(s => s.id)));
  };

  const deselectAll = () => {
    setSelectedStreets(new Set());
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Assignation sur la carte
          </CardTitle>
          <CardDescription>
            Cliquez sur les rues de la carte pour les sélectionner, puis assignez-les à une zone
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[200px] space-y-2">
              <Label htmlFor="zone-select-map">Zone de destination</Label>
              <Select value={selectedDistrict} onValueChange={setSelectedDistrict}>
                <SelectTrigger id="zone-select-map">
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
            <Button
              onClick={() => fetchData()}
              variant="outline"
              size="lg"
              title="Actualiser"
            >
              <RefreshCw className="w-4 h-4" />
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
                {district.name}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectByDistrict(null)}
            >
              Non assignées
            </Button>
          </div>

          {selectedStreets.size > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm font-medium text-yellow-800">
                {selectedStreets.size} rue{selectedStreets.size > 1 ? 's' : ''} sélectionnée{selectedStreets.size > 1 ? 's' : ''}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {Array.from(selectedStreets).slice(0, 10).map(id => {
                  const street = streets.find(s => s.id === id);
                  return street ? (
                    <Badge key={id} variant="secondary" className="text-xs">
                      {street.name}
                    </Badge>
                  ) : null;
                })}
                {selectedStreets.size > 10 && (
                  <Badge variant="secondary" className="text-xs">
                    +{selectedStreets.size - 10} autres...
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Carte interactive</CardTitle>
          <CardDescription>
            Cliquez sur une rue pour la sélectionner • CTRL/⌘+clic pour sélection multiple
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:flex md:flex-wrap gap-3 md:gap-4 mb-4 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: UNASSIGNED_COLOR }} />
              <span className="text-xs md:text-sm">Non assignée</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: SELECTED_COLOR }} />
              <span className="text-xs md:text-sm">Sélectionnée</span>
            </div>
            {districts.slice(0, 5).map((district) => (
              <div key={district.id} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: district.color }} />
                <span className="text-xs md:text-sm">{district.name}</span>
              </div>
            ))}
            {districts.length > 5 && (
              <div className="flex items-center gap-2">
                <span className="text-xs md:text-sm text-muted-foreground">+{districts.length - 5} zones...</span>
              </div>
            )}
          </div>

          <div
            ref={mapContainerRef}
            className="w-full h-[75vh] md:h-[calc(100vh-400px)] min-h-[500px] rounded-lg overflow-hidden border relative"
          >
            {streets.length === 0 && !loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/80 z-[1000] pointer-events-none">
                <div className="bg-background p-6 rounded-lg shadow-lg text-center max-w-md">
                  <p className="text-lg font-semibold mb-2">Aucune rue avec coordonnées GPS</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Pour afficher les rues sur la carte, vous devez d'abord importer leurs coordonnées depuis OpenStreetMap.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Allez dans <strong>"Import rues"</strong> dans le menu de navigation pour importer les coordonnées GPS de vos rues.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg mt-4">
            <p className="font-medium mb-2">💡 Astuces :</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Cliquez sur une rue pour la sélectionner</li>
              <li>Maintenez CTRL (ou ⌘ sur Mac) + clic pour sélectionner plusieurs rues</li>
              <li>Utilisez les boutons de sélection rapide pour sélectionner toutes les rues d'une zone</li>
              <li>Les rues sélectionnées apparaissent en jaune sur la carte</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ZoneMapAssignment;
