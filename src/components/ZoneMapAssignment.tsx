import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Check, MapPin, RefreshCw, Trash2, X, Split, Scissors, Save } from "lucide-react";
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
  number_start?: number;
  number_end?: number;
  label?: string; // Descriptive label (e.g., "Partie Nord", "Segment 1")
  side: string;
  building_type: string;
  district_id: string | null;
  geometry: any | null; // Custom GPS geometry for segments created by cutting
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

  // États pour le mode découpe
  const [editMode, setEditMode] = useState(false);
  const [editingStreet, setEditingStreet] = useState<Street | null>(null);
  const [cutMarkers, setCutMarkers] = useState<[number, number][]>([]);
  const [showSegmentNumbersDialog, setShowSegmentNumbersDialog] = useState(false);
  const [newSegmentsData, setNewSegmentsData] = useState<Array<{
    start: [number, number];
    end: [number, number];
    label: string;
  }>>([]);
  const markersRef = useRef<L.Marker[]>([]);
  const editModeRef = useRef(false); // Ref pour accéder à editMode dans les event handlers
  const editingStreetRef = useRef<Street | null>(null); // Ref pour accéder à editingStreet dans les event handlers

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
    console.log("🔧 ZoneMapAssignment loaded - Version with Mode découpe button");
    fetchData();
  }, []);

  useEffect(() => {
    editModeRef.current = editMode;
    console.log('🔄 editModeRef mis à jour:', editModeRef.current);
  }, [editMode]);

  useEffect(() => {
    editingStreetRef.current = editingStreet;
    console.log('🔄 editingStreetRef mis à jour:', editingStreetRef.current?.name);
  }, [editingStreet]);

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
            label,
            side,
            building_type,
            district_id,
            geometry
          )
        `)
        .not('coordinates', 'is', null)
        .order("name");

      if (streetsError) throw streetsError;

      console.log(`Total streets in DB: ${totalStreets}, Streets with coordinates: ${streetsData?.length || 0}`);

      // DEBUG: Vérifier les segments avec géométrie
      const streetsWithGeometry = streetsData?.filter((street: any) =>
        street.segments?.some((s: any) => s.geometry)
      );
      console.log('🔍 DEBUG - Streets with custom geometry segments:', streetsWithGeometry?.length || 0);
      streetsWithGeometry?.forEach((street: any) => {
        const segmentsWithGeom = street.segments.filter((s: any) => s.geometry);
        console.log(`  ↳ ${street.name}: ${segmentsWithGeom.length} segments avec geometry`);
        segmentsWithGeom.forEach((seg: any) => {
          console.log(`    - Segment ${seg.id}:`, seg.geometry);
        });
      });

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

        // Vérifier si au moins un segment a une géométrie personnalisée (créé par découpe)
        const hasCustomGeometry = sortedSegments.some(s => s.geometry && s.geometry.coordinates);

        // Diviser en segments si : plusieurs zones OU géométrie custom OU sélection en cours
        const shouldDivideBySegments =
          (uniqueZones.size > 1 || hasCustomGeometry || hasSelectedSegments) &&
          sortedSegments.length > 1 &&
          !isMultiLineString;

        console.log(`📍 ${street.name}:`, {
          segments: sortedSegments.length,
          evenSegments: evenSegments.length,
          oddSegments: oddSegments.length,
          hasMultipleSides,
          hasCustomGeometry,
          shouldDivideBySegments,
          uniqueZones: uniqueZones.size,
          isMultiLineString
        });

        // Fonction pour diviser une ligne en segments selon les zones
        const divideLineIntoSegments = (line: [number, number][], segments: Segment[]) => {
          if (segments.length === 0) return;

          const totalPoints = line.length;
          segments.forEach((segment, segIndex) => {
            // Check if segment has custom geometry
            let segmentLine: [number, number][];

            if (segment.geometry && segment.geometry.coordinates && Array.isArray(segment.geometry.coordinates)) {
              // Use custom geometry from segment
              console.log(`📍 Using custom geometry for segment ${segment.id}:`, segment.geometry);
              segmentLine = segment.geometry.coordinates.map((coord: any) => {
                if (Array.isArray(coord) && coord.length === 2) {
                  return [Number(coord[0]), Number(coord[1])] as [number, number];
                }
                return [0, 0] as [number, number];
              });
            } else {
              // Use proportional division of street line (existing logic)
              const startRatio = segIndex / segments.length;
              const endRatio = (segIndex + 1) / segments.length;

              const startIdx = Math.floor(startRatio * (totalPoints - 1));
              const endIdx = Math.ceil(endRatio * (totalPoints - 1));

              segmentLine = line.slice(startIdx, endIdx + 1);
            }

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
                console.log('🖱️ Clic sur polyline:', { editModeRef: editModeRef.current, street: street.name, segment: segment.id });
                if (editModeRef.current) {
                  // En mode découpe, placer un marqueur
                  console.log('✂️ Mode découpe actif - placement marqueur');
                  handleMapClick(e);
                } else {
                  // Sinon, ouvrir le dialog et sélectionner automatiquement ce segment
                  console.log('📋 Mode normal - ouverture dialog avec segment:', segment.id);
                  L.DomEvent.stopPropagation(e);
                  handleStreetClick(street, segment.id);
                }
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
                console.log('🖱️ Clic sur polyline:', { editModeRef: editModeRef.current, street: street.name });
                if (editModeRef.current) {
                  // En mode découpe, placer un marqueur
                  console.log('✂️ Mode découpe actif - placement marqueur');
                  handleMapClick(e);
                } else {
                  // Sinon, ouvrir le dialog
                  console.log('📋 Mode normal - ouverture dialog');
                  L.DomEvent.stopPropagation(e);
                  handleStreetClick(street);
                }
              });

              streetPolylines.push(polyline);
              allPolylines.push(polyline);
            });
          } else {
            const line: [number, number][] = (coords as number[][]).map(coord => [coord[0], coord[1]]);
            const polyline = L.polyline(line, polylineOptions).addTo(mapRef.current!);
            polyline.bindTooltip(tooltipText, { direction: 'top' });

            polyline.on('click', (e) => {
              if (editModeRef.current) {
                // En mode découpe, placer un marqueur
                handleMapClick(e);
              } else {
                // Sinon, ouvrir le dialog
                L.DomEvent.stopPropagation(e);
                handleStreetClick(street);
              }
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

  const handleStreetClick = (street: Street, segmentId?: string) => {
    setSelectedStreetForSegments(street);
    // Si un segment spécifique est cliqué, le sélectionner automatiquement
    if (segmentId) {
      const newSelection = new Set(selectedSegments);
      newSelection.add(segmentId);
      setSelectedSegments(newSelection);
      console.log(`✅ Segment ${segmentId} auto-sélectionné au clic`);
    }
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
              district_id,
              geometry
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

  const handleDeleteAllSegments = async (streetId: string) => {
    if (!confirm("⚠️ Supprimer TOUS les segments de cette rue ?\n\nCela permettra de recommencer avec le nouveau système simplifié (avec labels).")) return;

    try {
      const { error } = await supabase
        .from("segments")
        .delete()
        .eq("street_id", streetId);

      if (error) throw error;
      toast.success("Tous les segments ont été supprimés. Vous pouvez maintenant recréer des segments simplifiés.");

      // Rafraîchir les données
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
              label,
              side,
              building_type,
              district_id,
              geometry
            )
          `)
          .eq("id", selectedStreetForSegments.id)
          .single();

        if (updatedStreet) {
          setSelectedStreetForSegments(updatedStreet as any);
        }
      }
    } catch (error: any) {
      console.error("❌ Erreur lors de la suppression des segments:", error);
      toast.error("Erreur lors de la suppression des segments");
    }
  };

  const handleSplitSegment = async (segment: Segment) => {
    if (segment.side !== 'both') {
      toast.error("Ce segment est déjà divisé par côté");
      return;
    }

    try {
      // Calculer les plages de numéros pour pairs et impairs
      const firstEven = segment.number_start % 2 === 0 ? segment.number_start : segment.number_start + 1;
      const lastEven = segment.number_end % 2 === 0 ? segment.number_end : segment.number_end - 1;

      const firstOdd = segment.number_start % 2 === 1 ? segment.number_start : segment.number_start + 1;
      const lastOdd = segment.number_end % 2 === 1 ? segment.number_end : segment.number_end - 1;

      // Créer le segment pairs
      if (firstEven <= lastEven) {
        const { error: evenError } = await supabase
          .from("segments")
          .insert([{
            street_id: segment.street_id,
            number_start: firstEven,
            number_end: lastEven,
            side: 'even' as const,
            building_type: segment.building_type as "buildings" | "houses" | "mixed",
            district_id: segment.district_id,
          }]);

        if (evenError) throw evenError;
      }

      // Créer le segment impairs
      if (firstOdd <= lastOdd) {
        const { error: oddError } = await supabase
          .from("segments")
          .insert([{
            street_id: segment.street_id,
            number_start: firstOdd,
            number_end: lastOdd,
            side: 'odd' as const,
            building_type: segment.building_type as "buildings" | "houses" | "mixed",
            district_id: segment.district_id,
          }]);

        if (oddError) throw oddError;
      }

      // Supprimer le segment "both" original
      const { error: deleteError } = await supabase
        .from("segments")
        .delete()
        .eq("id", segment.id);

      if (deleteError) throw deleteError;

      toast.success("Segment divisé en Pairs et Impairs");

      // Rafraîchir les données
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
              district_id,
              geometry
            )
          `)
          .eq("id", selectedStreetForSegments.id)
          .single();

        if (updatedStreet) {
          setSelectedStreetForSegments(updatedStreet as any);
        }
      }
    } catch (error: any) {
      console.error("❌ Erreur lors de la division:", error);
      toast.error("Erreur lors de la division du segment");
    }
  };

  const enterEditMode = () => {
    if (!selectedStreetForSegments) return;

    console.log('✂️ Entrée en mode découpe pour:', selectedStreetForSegments.name);

    // Sauvegarder la rue en cours d'édition
    setEditingStreet(selectedStreetForSegments);
    setEditMode(true);
    setCutMarkers([]);

    // Fermer le dialog pour permettre de cliquer sur la carte
    const streetName = selectedStreetForSegments.name;
    setSelectedStreetForSegments(null);

    console.log('✂️ editMode défini à true, editingStreet:', streetName);

    toast.info(`Mode découpe activé pour ${streetName} - Cliquez sur la rue pour placer des marqueurs. Faites un clic droit sur un marqueur pour le supprimer.`, { duration: 8000 });

    // Activer le clic sur la carte
    if (mapRef.current) {
      mapRef.current.on('click', handleMapClick);
    }
  };

  const exitEditMode = () => {
    setEditMode(false);
    setEditingStreet(null);
    setCutMarkers([]);

    // Désactiver le clic sur la carte
    if (mapRef.current) {
      mapRef.current.off('click', handleMapClick);
    }

    // Supprimer tous les marqueurs
    markersRef.current.forEach(marker => {
      if (mapRef.current) {
        mapRef.current.removeLayer(marker);
      }
    });
    markersRef.current = [];

    toast.info("Mode découpe désactivé");
  };

  const handleMapClick = (e: L.LeafletMouseEvent) => {
    // IMPORTANT: Lire depuis les refs pour éviter les problèmes de closure!
    const currentEditMode = editModeRef.current;
    const currentEditingStreet = editingStreetRef.current;

    console.log('🗺️ handleMapClick appelé:', {
      editModeRef: currentEditMode,
      editingStreetRef: currentEditingStreet?.name,
      hasLatLng: !!e.latlng
    });

    if (!currentEditMode || !currentEditingStreet) {
      console.log('❌ Conditions non remplies - editMode:', currentEditMode, 'editingStreet:', currentEditingStreet?.name);
      return;
    }

    const clickPoint: [number, number] = [e.latlng.lat, e.latlng.lng];
    console.log('📍 Placement marqueur à:', clickPoint);

    // Ajouter le marqueur visuellement
    const marker = L.marker(clickPoint, {
      icon: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      }),
      draggable: true
    }).addTo(mapRef.current!);

    // Permettre de supprimer le marqueur avec un clic droit
    marker.on('contextmenu', () => {
      if (mapRef.current) {
        mapRef.current.removeLayer(marker);
      }
      const index = markersRef.current.indexOf(marker);
      if (index > -1) {
        markersRef.current.splice(index, 1);
        setCutMarkers(prev => prev.filter((_, i) => i !== index));
      }
    });

    // Mettre à jour la position si déplacé
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      const index = markersRef.current.indexOf(marker);
      if (index > -1) {
        setCutMarkers(prev => {
          const newMarkers = [...prev];
          newMarkers[index] = [pos.lat, pos.lng];
          return newMarkers;
        });
      }
    });

    markersRef.current.push(marker);
    setCutMarkers(prev => [...prev, clickPoint]);
  };

  const saveCutSegments = async () => {
    if (!editingStreet || cutMarkers.length === 0) {
      toast.error("Placez au moins un marqueur sur la rue");
      return;
    }

    if (!editingStreet.coordinates || editingStreet.coordinates.length === 0) {
      toast.error("Cette rue n'a pas de coordonnées GPS");
      return;
    }

    try {
      console.log("✂️ Début de la sauvegarde des découpes");
      console.log("Marqueurs placés:", cutMarkers);
      console.log("Coordonnées de la rue (brutes):", editingStreet.coordinates);
      console.log("Premier élément:", editingStreet.coordinates[0]);

      // Normaliser les coordonnées de la rue pour turf.js
      const normalizeCoords = (coords: any): [number, number][] => {
        if (!coords || coords.length === 0) return [];

        const result: [number, number][] = [];

        const processCoord = (coord: any): [number, number] | null => {
          // Si c'est un objet avec lat/lng
          if (typeof coord === 'object' && !Array.isArray(coord)) {
            const lat = coord.lat || coord.latitude;
            const lng = coord.lng || coord.lon || coord.longitude;
            if (lat !== undefined && lng !== undefined) {
              return [Number(lng), Number(lat)]; // [lon, lat] for GeoJSON
            }
          }

          // Si c'est un array de 2 nombres [lat, lon]
          if (Array.isArray(coord) && coord.length === 2 && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
            return [Number(coord[1]), Number(coord[0])]; // [lon, lat] for GeoJSON
          }

          // Si c'est un array qui contient d'autres arrays (MultiLineString)
          if (Array.isArray(coord) && coord.length > 0 && Array.isArray(coord[0])) {
            // C'est un array de lignes, aplatir récursivement
            return null; // On va le traiter séparément
          }

          return null;
        };

        for (let i = 0; i < coords.length; i++) {
          const coord = coords[i];

          // Si c'est un array d'arrays (MultiLineString ou LineString)
          if (Array.isArray(coord) && coord.length > 0 && Array.isArray(coord[0])) {
            console.log(`Coord ${i}: MultiLineString avec ${coord.length} points`);
            // Aplatir et traiter chaque sous-point
            for (let j = 0; j < coord.length; j++) {
              const processed = processCoord(coord[j]);
              if (processed) {
                result.push(processed);
              }
            }
          } else {
            // C'est un simple point
            const processed = processCoord(coord);
            if (processed) {
              console.log(`Coord ${i}: point [${processed[1]}, ${processed[0]}]`);
              result.push(processed);
            }
          }
        }

        return result;
      };

      const streetCoords = normalizeCoords(editingStreet.coordinates);
      console.log("✅ Coordonnées normalisées:", streetCoords.length, "points");

      if (streetCoords.length === 0) {
        toast.error("Les coordonnées de la rue sont invalides");
        return;
      }

      const streetLine = turf.lineString(streetCoords);

      // Pour chaque marqueur, calculer sa distance le long de la ligne de la rue
      const markersWithDistance = cutMarkers.map((marker, index) => {
        console.log(`Traitement marqueur ${index}:`, marker);
        const point = turf.point([Number(marker[1]), Number(marker[0])]); // [lon, lat]
        const snapped = turf.nearestPointOnLine(streetLine, point);
        return {
          coords: marker,
          distance: snapped.properties.location
        };
      });

      // Trier les marqueurs par distance le long de la rue
      markersWithDistance.sort((a, b) => a.distance - b.distance);
      console.log("Marqueurs triés:", markersWithDistance);

      // Créer les segments entre les marqueurs
      const segments: Array<{
        start: [number, number];
        end: [number, number];
        numberStart: string;
        numberEnd: string;
      }> = [];

      // Normaliser une coordonnée unique pour obtenir [lat, lon] (format Leaflet)
      const normalizeCoord = (coord: any): [number, number] => {
        // Si c'est un array d'arrays (MultiLineString), prendre le premier point
        if (Array.isArray(coord) && coord.length > 0 && Array.isArray(coord[0])) {
          return normalizeCoord(coord[0]); // Récursion pour obtenir le premier point
        }

        // Si c'est un objet avec lat/lng
        if (typeof coord === 'object' && !Array.isArray(coord)) {
          const lat = coord.lat || coord.latitude;
          const lng = coord.lng || coord.lon || coord.longitude;
          if (lat !== undefined && lng !== undefined) {
            return [Number(lat), Number(lng)];
          }
        }

        // Si c'est un array [lat, lon]
        if (Array.isArray(coord) && coord.length === 2 && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
          return [Number(coord[0]), Number(coord[1])];
        }

        return [0, 0];
      };

      // Ajouter un segment du début de la rue au premier marqueur
      const streetStart = normalizeCoord(editingStreet.coordinates[0]);
      console.log("📍 Début de rue:", streetStart);
      segments.push({
        start: streetStart,
        end: markersWithDistance[0].coords,
        label: "Segment 1"
      });

      // Ajouter les segments entre chaque paire de marqueurs
      for (let i = 0; i < markersWithDistance.length - 1; i++) {
        segments.push({
          start: markersWithDistance[i].coords,
          end: markersWithDistance[i + 1].coords,
          label: `Segment ${i + 2}`
        });
      }

      // Ajouter un segment du dernier marqueur à la fin de la rue
      // Pour la fin, on doit prendre le dernier point du dernier array
      const getLastCoord = (coords: any): any => {
        if (Array.isArray(coords) && coords.length > 0) {
          const last = coords[coords.length - 1];
          if (Array.isArray(last) && last.length > 0 && Array.isArray(last[0])) {
            return getLastCoord(last);
          }
          return last;
        }
        return coords;
      };

      const streetEnd = normalizeCoord(getLastCoord(editingStreet.coordinates));
      console.log("📍 Fin de rue:", streetEnd);
      const totalSegments = markersWithDistance.length + 1;
      segments.push({
        start: markersWithDistance[markersWithDistance.length - 1].coords,
        end: streetEnd,
        label: `Segment ${totalSegments}`
      });

      console.log("Segments créés:", segments);
      setNewSegmentsData(segments);
      setShowSegmentNumbersDialog(true);
    } catch (error: any) {
      console.error("❌ Erreur lors de la préparation des découpes:", error);
      toast.error("Erreur lors de la préparation des découpes: " + error.message);
    }
  };

  const confirmAndSaveSegments = async () => {
    if (!editingStreet) return;

    try {
      console.log("💾 Sauvegarde des segments dans la base de données");

      // Valider que tous les labels sont remplis
      for (const segment of newSegmentsData) {
        if (!segment.label || segment.label.trim() === '') {
          toast.error("Veuillez remplir tous les noms de segments");
          return;
        }
      }

      // Créer les nouveaux segments dans la base de données
      for (const segment of newSegmentsData) {
        // Créer la géométrie du segment (ligne entre start et end)
        const geometry = {
          type: "LineString",
          coordinates: [segment.start, segment.end]
        };

        const { error } = await supabase
          .from("segments")
          .insert({
            street_id: editingStreet.id,
            label: segment.label,
            side: 'both' as const,
            building_type: 'mixed' as const,
            geometry: geometry
          });

        if (error) throw error;
      }

      toast.success(`${newSegmentsData.length} segments créés avec succès !`);
      setShowSegmentNumbersDialog(false);
      exitEditMode();
      await fetchData();
    } catch (error: any) {
      console.error("❌ Erreur lors de la sauvegarde:", error);
      toast.error("Erreur lors de la sauvegarde: " + error.message);
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

            {/* Boutons flottants en mode découpe */}
            {editMode && editingStreet && (
              <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
                <div className="bg-background/95 backdrop-blur-sm p-3 rounded-lg shadow-lg border">
                  <p className="text-sm font-medium mb-2">✂️ Mode découpe: {editingStreet.name}</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    {cutMarkers.length} marqueur{cutMarkers.length > 1 ? 's' : ''} placé{cutMarkers.length > 1 ? 's' : ''}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={saveCutSegments}
                      disabled={cutMarkers.length === 0}
                      className="w-full"
                    >
                      <Save className="w-4 h-4 mr-1" />
                      Sauvegarder
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exitEditMode}
                      className="w-full"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Annuler
                    </Button>
                  </div>
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
              <div className="flex gap-2">
                {!editMode ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={enterEditMode}
                      className="text-primary"
                    >
                      <Scissors className="w-4 h-4 mr-1" />
                      Mode découpe
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectedStreetForSegments && handleDeleteAllSegments(selectedStreetForSegments.id)}
                      className="text-orange-600 hover:text-orange-700"
                      disabled={!selectedStreetForSegments?.segments || selectedStreetForSegments.segments.length === 0}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Supprimer les segments
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => selectedStreetForSegments && handleDeleteStreet(selectedStreetForSegments.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Supprimer la rue
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={saveCutSegments}
                      disabled={cutMarkers.length === 0}
                    >
                      <Save className="w-4 h-4 mr-1" />
                      Sauvegarder ({cutMarkers.length} marqueurs)
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exitEditMode}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Annuler
                    </Button>
                  </>
                )}
              </div>
            </DialogTitle>
            <DialogDescription>
              {editMode
                ? "Cliquez sur la carte pour placer des marqueurs de découpe. Clic droit sur un marqueur pour le supprimer."
                : "Sélectionnez les segments à assigner à une zone"}
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
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">
                            {segment.label
                              ? `${segment.label} • ${getSideLabel(segment.side)}`
                              : `N° ${segment.number_start} à ${segment.number_end} • ${getSideLabel(segment.side)}`
                            }
                          </p>
                          <div className="flex items-center gap-2">
                            {segment.side === 'both' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSplitSegment(segment);
                                }}
                                className="h-7 text-xs"
                                title="Diviser en Pairs et Impairs"
                              >
                                <Split className="w-3 h-3 mr-1" />
                                Diviser
                              </Button>
                            )}
                            <Badge
                              style={{
                                borderLeft: `4px solid ${getDistrictColor(segment.district_id)}`,
                              }}
                            >
                              {getDistrictName(segment.district_id)}
                            </Badge>
                          </div>
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

      {/* Dialog pour saisir les numéros de segments */}
      <Dialog open={showSegmentNumbersDialog} onOpenChange={setShowSegmentNumbersDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto z-[10000]">
          <DialogHeader>
            <DialogTitle>Nommer les segments créés</DialogTitle>
            <DialogDescription>
              Vous avez placé {cutMarkers.length} marqueur{cutMarkers.length > 1 ? 's' : ''}, ce qui crée {newSegmentsData.length} segment{newSegmentsData.length > 1 ? 's' : ''}.
              Donnez un nom à chaque segment (ex: "Partie Nord", "Segment 1", etc.).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {newSegmentsData.map((segment, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Segment {index + 1}</span>
                  <Badge variant="outline">
                    {segment.start[0].toFixed(5)}, {segment.start[1].toFixed(5)} → {segment.end[0].toFixed(5)}, {segment.end[1].toFixed(5)}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`segment-${index}-label`}>Nom du segment</Label>
                  <input
                    id={`segment-${index}-label`}
                    type="text"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder={`Ex: Partie ${index === 0 ? 'Ouest' : index === newSegmentsData.length - 1 ? 'Est' : 'Centre'}`}
                    value={segment.label}
                    onChange={(e) => {
                      const updated = [...newSegmentsData];
                      updated[index].label = e.target.value;
                      setNewSegmentsData(updated);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setShowSegmentNumbersDialog(false);
                setNewSegmentsData([]);
              }}
            >
              Annuler
            </Button>
            <Button onClick={confirmAndSaveSegments}>
              <Save className="w-4 h-4 mr-2" />
              Créer {newSegmentsData.length} segment{newSegmentsData.length > 1 ? 's' : ''}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ZoneMapAssignment;
