import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Check, MapPin, RefreshCw, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import * as turf from '@turf/turf';

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface Segment {
  id: string;
  street_id: string;
  number_start: number;
  number_end: number;
  side: string;
  building_type: string;
  district_id: string | null;
}

interface Street {
  id: string;
  name: string;
  type: string;
  coordinates: number[][] | number[][][] | null;
  segments: Segment[];
}

interface District {
  id: string;
  name: string;
  color: string;
}

const UNASSIGNED_COLOR = "#94a3b8";
const SELECTED_COLOR = "#facc15";
const MIXED_COLOR = "#8b5cf6";

// Helper functions for parallel lines
const leafletToGeoJSON = (coords: number[][]): number[][] => {
  return coords.map(([lat, lon]) => [lon, lat]);
};

const geoJSONToLeaflet = (coords: number[][]): [number, number][] => {
  return coords.map(([lon, lat]): [number, number] => [lat, lon]);
};

const createParallelLine = (coords: number[][], offsetMeters: number): [number, number][] | null => {
  try {
    const geoCoords = leafletToGeoJSON(coords);
    const line = turf.lineString(geoCoords);
    const offsetLine = turf.lineOffset(line, offsetMeters / 1000, { units: 'kilometers' });
    return geoJSONToLeaflet(offsetLine.geometry.coordinates);
  } catch (error) {
    console.error("Error creating parallel line:", error);
    return null;
  }
};

const ZoneMapAssignment = () => {
  const [streets, setStreets] = useState<Street[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [selectedSegments, setSelectedSegments] = useState<Set<string>>(new Set());
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [selectedStreetForSegments, setSelectedStreetForSegments] = useState<Street | null>(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<L.Map | null>(null);
  const polylinesRef = useRef<Map<string, L.Polyline[]>>(new Map());

  const center: [number, number] = [44.8771, 4.8772];
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

    const InfoControl = L.Control.extend({
      onAdd: function () {
        const div = L.DomUtil.create('div', 'leaflet-control-info');
        div.style.padding = '10px';
        div.style.background = 'white';
        div.style.borderRadius = '5px';
        div.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        div.innerHTML = '<h4 style="margin: 0 0 5px 0;">Sélection</h4><p id="info-content" style="margin: 0; font-size: 12px;">Cliquez sur une rue pour voir ses segments</p>';
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
  }, [streets, selectedSegments, districts]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { count: totalStreets } = await supabase
        .from("streets")
        .select("*", { count: 'exact', head: true });

      const { data: streetsData, error: streetsError } = await supabase
        .from("streets")
        .select(`
          id,
          name,
          type,
          coordinates,
          segments (
            id,
            street_id,
            number_start,
            number_end,
            side,
            building_type,
            district_id
          )
        `)
        .not('coordinates', 'is', null)
        .order("name");

      if (streetsError) throw streetsError;

      console.log(`Total streets in DB: ${totalStreets}, Streets with coordinates: ${streetsData?.length || 0}`);

      if (!streetsData || streetsData.length === 0) {
        if (totalStreets && totalStreets > 0) {
          toast.info(`Aucune rue avec coordonnées GPS trouvée.`, { duration: 5000 });
        }
      }

      setStreets(streetsData as any || []);

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

  const getStreetColor = (street: Street) => {
    if (!street.segments || street.segments.length === 0) return UNASSIGNED_COLOR;

    const zones = new Set(street.segments.map(s => s.district_id).filter(Boolean));

    if (zones.size === 0) return UNASSIGNED_COLOR;
    if (zones.size === 1) {
      const zoneId = Array.from(zones)[0];
      const district = districts.find(d => d.id === zoneId);
      return district?.color || UNASSIGNED_COLOR;
    }
    return MIXED_COLOR;
  };

  const renderStreets = () => {
    if (!mapRef.current) return;

    console.log(`🗺️ Rendering ${streets.length} streets on map`);

    polylinesRef.current.forEach((polylines) => {
      polylines.forEach(p => {
        if (mapRef.current) {
          mapRef.current.removeLayer(p);
        }
      });
    });
    polylinesRef.current.clear();

    const infoContent = document.getElementById('info-content');
    if (infoContent) {
      const totalSegments = streets.reduce((sum, s) => sum + (s.segments?.length || 0), 0);
      const assignedSegments = streets.reduce((sum, s) =>
        sum + (s.segments?.filter(seg => seg.district_id)?.length || 0), 0);

      infoContent.innerHTML = `
        <strong>${streets.length} rues • ${totalSegments} segments</strong><br/>
        <span style="color: #22c55e">● ${assignedSegments} segments assignés</span><br/>
        ${selectedSegments.size > 0 ? `<br/><strong style="color: ${SELECTED_COLOR}">● ${selectedSegments.size} segment(s) sélectionné(s)</strong>` : ''}
      `;
    }

    const allPolylines: L.Polyline[] = [];

    streets.forEach((street) => {
      if (!mapRef.current || !street.coordinates) return;

      try {
        const coords = street.coordinates;
        const isMultiLineString = Array.isArray(coords[0]) && Array.isArray(coords[0][0]);

        const hasSelectedSegments = street.segments?.some(seg => selectedSegments.has(seg.id));

        // Trier les segments par number_start
        const sortedSegments = street.segments ? [...street.segments].sort((a, b) => a.number_start - b.number_start) : [];

        const segmentCount = sortedSegments.length;
        const assignedCount = sortedSegments.filter(s => s.district_id).length;
        const tooltipText = `<strong>${street.name}</strong><br/>${segmentCount} segment(s) • ${assignedCount} assigné(s)<br/><em>Cliquez pour voir les segments</em>`;

        const streetPolylines: L.Polyline[] = [];

        // Grouper les segments par côté (pairs/impairs)
        const evenSegments = sortedSegments.filter(s => s.side === 'even' || s.side === 'both');
        const oddSegments = sortedSegments.filter(s => s.side === 'odd' || s.side === 'both');

        const hasMultipleSides = evenSegments.length > 0 && oddSegments.length > 0 &&
          (evenSegments.some(s => s.district_id) || oddSegments.some(s => s.district_id));

        const uniqueZones = new Set(sortedSegments.map(s => s.district_id).filter(Boolean));
        const shouldDivideBySegments = uniqueZones.size > 1 && sortedSegments.length > 1 && !isMultiLineString;

        console.log(`📍 ${street.name}:`, {
          segments: sortedSegments.length,
          evenSegments: evenSegments.length,
          oddSegments: oddSegments.length,
          hasMultipleSides,
          shouldDivideBySegments,
          uniqueZones: uniqueZones.size,
          isMultiLineString
        });

        // Fonction pour diviser une ligne en segments selon les zones
        const divideLineIntoSegments = (line: [number, number][], segments: Segment[]) => {
          if (segments.length === 0) return;

          const totalPoints = line.length;
          segments.forEach((segment, segIndex) => {
            const startRatio = segIndex / segments.length;
            const endRatio = (segIndex + 1) / segments.length;

            const startIdx = Math.floor(startRatio * (totalPoints - 1));
            const endIdx = Math.ceil(endRatio * (totalPoints - 1));

            const segmentLine = line.slice(startIdx, endIdx + 1);

            if (segmentLine.length >= 2) {
              const isSegmentSelected = selectedSegments.has(segment.id);
              const segmentColor = isSegmentSelected
                ? SELECTED_COLOR
                : (segment.district_id
                    ? (districts.find(d => d.id === segment.district_id)?.color || UNASSIGNED_COLOR)
                    : UNASSIGNED_COLOR);

              const polylineOptions = {
                color: segmentColor,
                weight: isSegmentSelected ? 7 : 5,
                opacity: isSegmentSelected ? 1 : 0.7,
              };

              const polyline = L.polyline(segmentLine, polylineOptions).addTo(mapRef.current!);
              polyline.bindTooltip(tooltipText, { direction: 'top' });

              polyline.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                handleStreetClick(street);
              });

              streetPolylines.push(polyline);
              allPolylines.push(polyline);
            }
          });
        };

        if (hasMultipleSides) {
          // Créer des lignes parallèles pour séparer pairs/impairs
          let parallelLinesCreated = false;

          const processLine = (line: [number, number][]) => {
            // Ligne pour les numéros pairs (côté gauche, décalage négatif)
            if (evenSegments.length > 0 && evenSegments.some(s => s.district_id)) {
              const evenLine = createParallelLine(line, -8);
              if (evenLine) {
                console.log(`  ↳ Ligne parallèle pairs créée pour ${street.name}`);
                divideLineIntoSegments(evenLine, evenSegments.filter(s => s.district_id));
                parallelLinesCreated = true;
              } else {
                console.warn(`  ⚠️ Échec création ligne pairs pour ${street.name}`);
              }
            }

            // Ligne pour les numéros impairs (côté droit, décalage positif)
            if (oddSegments.length > 0 && oddSegments.some(s => s.district_id)) {
              const oddLine = createParallelLine(line, 8);
              if (oddLine) {
                console.log(`  ↳ Ligne parallèle impairs créée pour ${street.name}`);
                divideLineIntoSegments(oddLine, oddSegments.filter(s => s.district_id));
                parallelLinesCreated = true;
              } else {
                console.warn(`  ⚠️ Échec création ligne impairs pour ${street.name}`);
              }
            }
          };

          if (isMultiLineString) {
            // Pour MultiLineString, traiter chaque way séparément
            const ways = coords as number[][][];
            ways.forEach((way) => {
              const line: [number, number][] = way.map(coord => [coord[0], coord[1]]);
              processLine(line);
            });
          } else {
            // Pour LineString simple
            const line: [number, number][] = (coords as number[][]).map(coord => [coord[0], coord[1]]);
            processLine(line);
          }

          // Fallback : si les lignes parallèles n'ont pas pu être créées, afficher normalement
          if (!parallelLinesCreated) {
            console.log(`  ↳ Fallback: affichage normal pour ${street.name}`);
            if (isMultiLineString) {
              const ways = coords as number[][][];
              ways.forEach((way) => {
                const line: [number, number][] = way.map(coord => [coord[0], coord[1]]);
                divideLineIntoSegments(line, sortedSegments);
              });
            } else {
              const line: [number, number][] = (coords as number[][]).map(coord => [coord[0], coord[1]]);
              divideLineIntoSegments(line, sortedSegments);
            }
          }
        } else if (shouldDivideBySegments) {
          // Division simple par segments (sans séparation pairs/impairs)
          const line: [number, number][] = (coords as number[][]).map(coord => [coord[0], coord[1]]);
          divideLineIntoSegments(line, sortedSegments);
        } else {
          // Comportement original : toute la rue d'une seule couleur
          const color = hasSelectedSegments ? SELECTED_COLOR : getStreetColor(street);

          const polylineOptions = {
            color,
            weight: hasSelectedSegments ? 7 : 5,
            opacity: hasSelectedSegments ? 1 : 0.7,
          };

          if (isMultiLineString) {
            const ways = coords as number[][][];
            ways.forEach((way) => {
              const line: [number, number][] = way.map(coord => [coord[0], coord[1]]);
              const polyline = L.polyline(line, polylineOptions).addTo(mapRef.current!);
              polyline.bindTooltip(tooltipText, { direction: 'top' });

              polyline.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                handleStreetClick(street);
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
              handleStreetClick(street);
            });

            streetPolylines.push(polyline);
            allPolylines.push(polyline);
          }
        }

        polylinesRef.current.set(street.id, streetPolylines);
      } catch (error) {
        console.error(`❌ Error adding street ${street.name}:`, error);
      }
    });

    if (allPolylines.length > 0 && mapRef.current) {
      try {
        const group = L.featureGroup(allPolylines);
        mapRef.current.fitBounds(group.getBounds().pad(0.1));
      } catch (error) {
        console.error('❌ Error centering map:', error);
      }
    }
  };

  const handleStreetClick = (street: Street) => {
    setSelectedStreetForSegments(street);
  };

  const toggleSegment = (segmentId: string) => {
    const newSelection = new Set(selectedSegments);
    const action = newSelection.has(segmentId) ? 'désélectionné' : 'sélectionné';
    if (newSelection.has(segmentId)) {
      newSelection.delete(segmentId);
    } else {
      newSelection.add(segmentId);
    }
    console.log(`🔘 Segment ${action}:`, segmentId, `→ Total: ${newSelection.size} segment(s)`);
    setSelectedSegments(newSelection);
  };

  const selectAllSegmentsInStreet = (street: Street) => {
    const newSelection = new Set(selectedSegments);
    street.segments?.forEach(seg => newSelection.add(seg.id));
    setSelectedSegments(newSelection);
  };

  const deselectAllSegmentsInStreet = (street: Street) => {
    const newSelection = new Set(selectedSegments);
    street.segments?.forEach(seg => newSelection.delete(seg.id));
    setSelectedSegments(newSelection);
  };

  const handleBulkAssign = async () => {
    if (selectedSegments.size === 0) {
      toast.error("Veuillez sélectionner au moins un segment");
      return;
    }

    if (!selectedDistrict) {
      toast.error("Veuillez sélectionner une zone");
      return;
    }

    try {
      const updates = Array.from(selectedSegments).map((segmentId) => ({
        id: segmentId,
        district_id: selectedDistrict === "none" ? null : selectedDistrict,
      }));

      console.log("🎯 Assignation de segments:", {
        nbSegments: updates.length,
        segmentIds: updates.map(u => u.id),
        districtId: selectedDistrict,
        districtName: districts.find(d => d.id === selectedDistrict)?.name
      });

      for (const update of updates) {
        console.log(`  ↳ Mise à jour segment ${update.id} → zone ${districts.find(d => d.id === update.district_id)?.name || 'aucune'}`);
        const { error } = await supabase
          .from("segments")
          .update({ district_id: update.district_id })
          .eq("id", update.id);

        if (error) throw error;
      }

      toast.success(`${selectedSegments.size} segment${selectedSegments.size > 1 ? 's assignés' : ' assigné'}`);
      setSelectedSegments(new Set());
      setSelectedDistrict("");
      // Ne pas fermer le dialog pour permettre d'assigner d'autres segments
      await fetchData();

      // Mettre à jour les données de la rue affichée dans le dialog
      if (selectedStreetForSegments) {
        const { data: updatedStreet } = await supabase
          .from("streets")
          .select(`
            id,
            name,
            type,
            coordinates,
            segments (
              id,
              street_id,
              number_start,
              number_end,
              side,
              building_type,
              district_id
            )
          `)
          .eq("id", selectedStreetForSegments.id)
          .single();

        if (updatedStreet) {
          setSelectedStreetForSegments(updatedStreet as any);
        }
      }
    } catch (error: any) {
      console.error("❌ Erreur lors de l'assignation:", error);
      toast.error("Erreur lors de l'assignation");
    }
  };

  const handleDeleteStreet = async (streetId: string) => {
    if (!confirm("Supprimer cette rue et tous ses segments ?")) return;

    try {
      const { error } = await supabase
        .from("streets")
        .delete()
        .eq("id", streetId);

      if (error) throw error;
      toast.success("Rue supprimée");
      setSelectedStreetForSegments(null);
      fetchData();
    } catch (error: any) {
      toast.error("Erreur lors de la suppression");
    }
  };

  const getSideLabel = (side: string) => {
    const labels: Record<string, string> = {
      even: "Pairs",
      odd: "Impairs",
      both: "Les deux",
    };
    return labels[side] || side;
  };

  const getDistrictName = (districtId: string | null) => {
    if (!districtId) return "Non assigné";
    const district = districts.find(d => d.id === districtId);
    return district?.name || "Inconnu";
  };

  const getDistrictColor = (districtId: string | null) => {
    if (!districtId) return UNASSIGNED_COLOR;
    const district = districts.find(d => d.id === districtId);
    return district?.color || UNASSIGNED_COLOR;
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
            Assignation par segments sur la carte
          </CardTitle>
          <CardDescription>
            Cliquez sur une rue pour sélectionner ses segments (pairs/impairs, numéros spécifiques)
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
              disabled={selectedSegments.size === 0 || !selectedDistrict}
              size="lg"
            >
              <Check className="w-4 h-4 mr-2" />
              Assigner {selectedSegments.size > 0 && `(${selectedSegments.size})`}
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

          {selectedSegments.size > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-yellow-800">
                  {selectedSegments.size} segment{selectedSegments.size > 1 ? 's' : ''} sélectionné{selectedSegments.size > 1 ? 's' : ''}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedSegments(new Set())}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Carte interactive</CardTitle>
          <CardDescription>
            Cliquez sur une rue pour voir et sélectionner ses segments
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
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: MIXED_COLOR }} />
              <span className="text-xs md:text-sm">Zones multiples</span>
            </div>
            {districts.slice(0, 4).map((district) => (
              <div key={district.id} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: district.color }} />
                <span className="text-xs md:text-sm">{district.name}</span>
              </div>
            ))}
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
                    Pour afficher les rues sur la carte, importez d'abord leurs coordonnées depuis OpenStreetMap.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Allez dans <strong>"Import rues"</strong> dans le menu de navigation.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg mt-4">
            <p className="font-medium mb-2">💡 Astuces :</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Cliquez sur une rue pour voir ses segments</li>
              <li>Sélectionnez les segments individuellement (pairs/impairs, numéros spécifiques)</li>
              <li>Les rues avec plusieurs zones apparaissent en violet</li>
              <li>Assignez les segments sélectionnés à une zone avec le bouton "Assigner"</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Dialog open={selectedStreetForSegments !== null} onOpenChange={(open) => !open && setSelectedStreetForSegments(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto z-[9999]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{selectedStreetForSegments?.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => selectedStreetForSegments && handleDeleteStreet(selectedStreetForSegments.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Supprimer la rue
              </Button>
            </DialogTitle>
            <DialogDescription>
              Sélectionnez les segments à assigner à une zone
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectedStreetForSegments && selectAllSegmentsInStreet(selectedStreetForSegments)}
              >
                Tout sélectionner
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectedStreetForSegments && deselectAllSegmentsInStreet(selectedStreetForSegments)}
              >
                Tout désélectionner
              </Button>
            </div>

            {selectedStreetForSegments?.segments && selectedStreetForSegments.segments.length > 0 ? (
              <div className="space-y-2">
                {selectedStreetForSegments.segments.map((segment) => (
                  <div
                    key={segment.id}
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      selectedSegments.has(segment.id)
                        ? 'bg-yellow-50 border-yellow-300'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => toggleSegment(segment.id)}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedSegments.has(segment.id)}
                        onCheckedChange={() => toggleSegment(segment.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">
                            N° {segment.number_start} à {segment.number_end} • {getSideLabel(segment.side)}
                          </p>
                          <Badge
                            style={{
                              borderLeft: `4px solid ${getDistrictColor(segment.district_id)}`,
                            }}
                          >
                            {getDistrictName(segment.district_id)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Type: {segment.building_type}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Aucun segment défini pour cette rue. Allez dans "Rues & Segments" pour en créer.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ZoneMapAssignment;
