import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, MapPin, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface OverpassStreet {
  type: string;
  id: number;
  tags: {
    name?: string;
    highway?: string;
  };
}

const ImportStreets = () => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [imported, setImported] = useState(0);
  const [skipped, setSkipped] = useState(0);

  const getStreetType = (highway: string): "street" | "avenue" | "impasse" | "boulevard" | "place" | "chemin" | "route" => {
    const mapping: Record<string, any> = {
      primary: "boulevard",
      secondary: "avenue",
      tertiary: "street",
      residential: "street",
      unclassified: "street",
      living_street: "impasse",
      pedestrian: "place",
      footway: "chemin",
      path: "chemin",
      service: "chemin",
    };
    
    return mapping[highway] || "street";
  };

  const fetchStreetsFromOverpass = async (): Promise<OverpassStreet[]> => {
    // Requête Overpass API pour récupérer toutes les rues de Portes-lès-Valence avec géométrie
    const query = `
      [out:json][timeout:60];
      area["name"="Portes-lès-Valence"]["admin_level"="8"]->.a;
      (
        way["highway"]["name"](area.a);
        node["addr:housenumber"](area.a);
      );
      out geom;
    `;

    const url = "https://overpass-api.de/api/interpreter";
    
    try {
      const response = await fetch(url, {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      if (!response.ok) {
        throw new Error("Erreur lors de la récupération des données");
      }

      const data = await response.json();
      return data.elements || [];
    } catch (error) {
      throw error;
    }
  };

  const extractCoordinates = (street: any): number[][] => {
    // Extract coordinates from the geometry
    if (street.geometry && Array.isArray(street.geometry)) {
      return street.geometry.map((node: any) => [node.lat, node.lon]);
    }
    return [];
  };

  const getStreetNumbers = (elements: any[], streetName: string): number[] => {
    const numbers: number[] = [];
    
    elements.forEach(element => {
      if (element.type === 'node' && element.tags?.['addr:street'] === streetName && element.tags?.['addr:housenumber']) {
        const houseNumber = parseInt(element.tags['addr:housenumber']);
        if (!isNaN(houseNumber)) {
          numbers.push(houseNumber);
        }
      }
    });
    
    return numbers.sort((a, b) => a - b);
  };

  const createSegmentsArray = (streetId: string, maxNumber: number): Array<{street_id: string, number_start: number, number_end: number, side: 'both' | 'even' | 'odd', building_type: 'mixed' | 'houses' | 'buildings'}> => {
    const segments = [];
    const segmentSize = 50;
    
    if (maxNumber <= segmentSize) {
      // Si la rue a moins de 50 numéros, un seul segment
      segments.push({
        street_id: streetId,
        number_start: 1,
        number_end: maxNumber,
        side: 'both' as const,
        building_type: 'mixed' as const
      });
    } else {
      // Sinon, découper en segments de 50
      for (let start = 1; start <= maxNumber; start += segmentSize) {
        const end = Math.min(start + segmentSize - 1, maxNumber);
        segments.push({
          street_id: streetId,
          number_start: start,
          number_end: end,
          side: 'both' as const,
          building_type: 'mixed' as const
        });
      }
    }
    
    return segments;
  };

  const handleImport = async () => {
    setLoading(true);
    setProgress(0);
    setImported(0);
    setSkipped(0);

    try {
      toast.info("Récupération des rues depuis OpenStreetMap...");
      
      const elements = await fetchStreetsFromOverpass();
      
      if (elements.length === 0) {
        toast.warning("Aucune donnée trouvée");
        setLoading(false);
        return;
      }

      // Filter only ways (streets)
      const streets = elements.filter(el => el.type === 'way' && el.tags?.name);
      
      toast.info(`${streets.length} rues trouvées, importation avec segmentation automatique...`);

      // Get existing streets to avoid duplicates
      const { data: existingStreets } = await supabase
        .from("streets")
        .select("id, name");
      
      const existingNames = new Map(existingStreets?.map(s => [s.name, s.id]) || []);

      let importedCount = 0;
      let skippedCount = 0;
      let segmentsCreated = 0;

      for (let i = 0; i < streets.length; i++) {
        const street = streets[i];
        const streetName = street.tags.name;
        const streetType = street.tags.highway;

        if (!streetName || !streetType) {
          skippedCount++;
          continue;
        }

        let streetId: string;
        let createSegments = false;

        // Check if already exists
        if (existingNames.has(streetName)) {
          streetId = existingNames.get(streetName)!;
          
          // Check if this street already has segments
          const { data: existingSegments } = await supabase
            .from("segments")
            .select("id")
            .eq("street_id", streetId);
          
          if (!existingSegments || existingSegments.length === 0) {
            createSegments = true;
          }
          
          skippedCount++;
        } else {
          // Insert street
          const coordinates = extractCoordinates(street);
          
          const { data, error } = await supabase
            .from("streets")
            .insert({
              name: streetName,
              type: getStreetType(streetType),
              district: "Importé",
              neighborhood: "OpenStreetMap",
              coordinates: coordinates.length > 0 ? coordinates : null,
            })
            .select()
            .single();

          if (error || !data) {
            skippedCount++;
            setProgress(((i + 1) / streets.length) * 100);
            continue;
          }

          streetId = data.id;
          importedCount++;
          existingNames.set(streetName, streetId);
          createSegments = true;
        }

        // Create segments if needed
        if (createSegments) {
          // Get house numbers for this street
          const numbers = getStreetNumbers(elements, streetName);
          const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 100; // Default to 100 if no numbers found

          // Create segments
          const segments = createSegmentsArray(streetId, maxNumber);
          
          // Insert segments
          const { error: segError } = await supabase
            .from("segments")
            .insert(segments);

          if (!segError) {
            segmentsCreated += segments.length;
          }
        }

        setImported(importedCount);
        setSkipped(skippedCount);
        setProgress(((i + 1) / streets.length) * 100);

        // Small delay to avoid overwhelming the UI
        if (i % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      toast.success(`Import terminé ! ${importedCount} rue(s) importée(s), ${segmentsCreated} segment(s) créé(s), ${skippedCount} ignorée(s)`);
    } catch (error: any) {
      console.error("Import error:", error);
      toast.error("Erreur lors de l'import: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import des rues</h1>
        <p className="text-muted-foreground">
          Importez automatiquement les rues depuis OpenStreetMap
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Import depuis OpenStreetMap
          </CardTitle>
          <CardDescription>
            Cette fonction récupère automatiquement toutes les rues de Portes-lès-Valence depuis la base 
            de données OpenStreetMap via l'API Overpass.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-primary mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Comment ça fonctionne ?</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>L'API Overpass d'OpenStreetMap est interrogée pour récupérer toutes les rues</li>
                  <li>Les numéros de maison sont récupérés pour déterminer la longueur des rues</li>
                  <li>Les rues sont segmentées automatiquement tous les 50 numéros</li>
                  <li>Les rues de moins de 50 numéros ont un seul segment</li>
                  <li>L'import peut prendre quelques minutes selon le nombre de rues</li>
                </ul>
              </div>
            </div>
          </div>

          {loading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Progression</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Importées: {imported}</span>
                <span>Ignorées: {skipped}</span>
              </div>
            </div>
          )}

          <Button
            onClick={handleImport}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Import en cours...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Importer les rues depuis OpenStreetMap
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground">
            Source de données: © OpenStreetMap contributors, disponible sous la licence Open Database License (ODbL)
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ImportStreets;