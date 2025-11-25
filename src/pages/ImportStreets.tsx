import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, MapPin, AlertCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface BANFeature {
  type: "Feature";
  geometry: {
    type: "LineString" | "Point";
    coordinates: number[][] | number[];
  };
  properties: {
    label: string;
    name: string;
    postcode: string;
    citycode: string;
    city: string;
    type: string;
    street?: string;
    housenumber?: string;
  };
}

interface BANResponse {
  features: BANFeature[];
}

const ImportStreets = () => {
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [imported, setImported] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [updated, setUpdated] = useState(0);

  const getStreetType = (streetName: string): "street" | "avenue" | "impasse" | "boulevard" | "place" | "chemin" | "route" => {
    const name = streetName.toLowerCase();
    
    if (name.includes("avenue") || name.startsWith("av ")) return "avenue";
    if (name.includes("boulevard") || name.startsWith("bd ")) return "boulevard";
    if (name.includes("impasse") || name.startsWith("imp ")) return "impasse";
    if (name.includes("place") || name.startsWith("pl ")) return "place";
    if (name.includes("chemin") || name.startsWith("ch ")) return "chemin";
    if (name.includes("route") || name.startsWith("rte ")) return "route";
    if (name.includes("rue") || name.startsWith("r ")) return "street";
    
    return "street";
  };

  const fetchStreetsFromBAN = async (): Promise<BANResponse> => {
    // Code INSEE de Portes-lès-Valence: 26252
    const url = "https://api-adresse.data.gouv.fr/search/?q=&citycode=26252&type=street&limit=1000";
    
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Erreur lors de la récupération des données BAN");
      }

      const data: BANResponse = await response.json();
      return data;
    } catch (error) {
      throw error;
    }
  };

  const extractCoordinates = (feature: BANFeature): number[][] => {
    if (!feature.geometry || !feature.geometry.coordinates) {
      return [];
    }

    // BAN returns [lon, lat] but we need [lat, lon] for Leaflet
    if (feature.geometry.type === "LineString") {
      return (feature.geometry.coordinates as number[][]).map(coord => [coord[1], coord[0]]);
    } else if (feature.geometry.type === "Point") {
      const coord = feature.geometry.coordinates as number[];
      return [[coord[1], coord[0]]];
    }
    
    return [];
  };

  const getStreetNumbers = async (streetName: string): Promise<number[]> => {
    try {
      // Récupérer toutes les adresses de cette rue via l'API BAN
      const encodedStreet = encodeURIComponent(streetName);
      const url = `https://api-adresse.data.gouv.fr/search/?q=${encodedStreet}&citycode=26252&type=housenumber&limit=1000`;
      
      const response = await fetch(url);
      if (!response.ok) return [];
      
      const data: BANResponse = await response.json();
      const numbers: number[] = [];
      
      data.features.forEach(feature => {
        if (feature.properties.housenumber) {
          const num = parseInt(feature.properties.housenumber);
          if (!isNaN(num)) {
            numbers.push(num);
          }
        }
      });
      
      return numbers.sort((a, b) => a - b);
    } catch (error) {
      console.error("Erreur récupération numéros:", error);
      return [];
    }
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
      toast.info("Récupération des rues depuis la Base Adresse Nationale...");
      
      const banData = await fetchStreetsFromBAN();
      
      if (!banData.features || banData.features.length === 0) {
        toast.warning("Aucune donnée trouvée");
        setLoading(false);
        return;
      }

      const streets = banData.features;
      
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
        const streetName = street.properties.name;

        if (!streetName) {
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
              type: getStreetType(streetName),
              district: "Importé",
              neighborhood: "Base Adresse Nationale",
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
          // Get house numbers for this street from BAN
          const numbers = await getStreetNumbers(streetName);
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

  const handleUpdateCoordinates = async () => {
    setUpdating(true);
    setProgress(0);
    setUpdated(0);

    try {
      // Fetch all streets from database
      const { data: existingStreets, error: fetchError } = await supabase
        .from("streets")
        .select("id, name, type");

      if (fetchError) throw fetchError;

      if (!existingStreets || existingStreets.length === 0) {
        toast.error("Aucune rue trouvée dans la base de données");
        setUpdating(false);
        return;
      }

      toast.info(`Mise à jour des coordonnées pour ${existingStreets.length} rues...`);

      // Fetch streets from BAN
      const banData = await fetchStreetsFromBAN();
      const streets = banData.features;

      let updatedCount = 0;

      for (let i = 0; i < existingStreets.length; i++) {
        const dbStreet = existingStreets[i];
        
        // Find matching street in BAN data
        const banStreet = streets.find(
          (s: BANFeature) => s.properties.name === dbStreet.name
        );

        if (banStreet) {
          const coordinates = extractCoordinates(banStreet);
          
          if (coordinates.length > 0) {
            // Update coordinates
            const { error } = await supabase
              .from("streets")
              .update({ coordinates })
              .eq("id", dbStreet.id);

            if (!error) {
              updatedCount++;
            }
          }
        }

        setUpdated(updatedCount);
        setProgress(((i + 1) / existingStreets.length) * 100);

        if (i % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      toast.success(`${updatedCount} rue(s) mise(s) à jour avec les coordonnées GPS !`);
    } catch (error: any) {
      console.error("Update error:", error);
      toast.error("Erreur lors de la mise à jour: " + error.message);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import des rues</h1>
        <p className="text-muted-foreground">
          Importez automatiquement les rues depuis la Base Adresse Nationale
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Import depuis la Base Adresse Nationale
          </CardTitle>
          <CardDescription>
            Cette fonction récupère automatiquement toutes les rues officielles de Portes-lès-Valence depuis 
            la Base Adresse Nationale (BAN), la base de données de référence des adresses en France.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-primary mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Comment ça fonctionne ?</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>L'API BAN est interrogée pour récupérer toutes les voies officielles (code INSEE: 26252)</li>
                  <li>Les numéros de maison officiels sont récupérés pour chaque rue</li>
                  <li>Les rues sont segmentées automatiquement tous les 50 numéros</li>
                  <li>Les rues de moins de 50 numéros ont un seul segment</li>
                  <li>Données 100% officielles et exhaustives (IGN + DGFiP)</li>
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
            disabled={loading || updating}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Import en cours...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Importer les rues depuis la BAN
              </>
            )}
          </Button>

          {(imported > 0 || skipped > 0) && !loading && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm">
                <strong>{imported}</strong> rue(s) importée(s)
                <br />
                <strong>{skipped}</strong> rue(s) ignorée(s) (déjà existantes)
              </p>
            </div>
          )}

          <div className="mt-6 pt-6 border-t">
            <h3 className="font-semibold mb-2">Mettre à jour les coordonnées GPS</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Si vous avez déjà importé les rues mais qu'elles n'ont pas de coordonnées GPS,
              utilisez ce bouton pour les mettre à jour sans réimporter toutes les rues.
            </p>
            
            {updating && (
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span>Progression</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} />
                <div className="text-sm text-muted-foreground">
                  Mises à jour: {updated}
                </div>
              </div>
            )}
            
            <Button 
              onClick={handleUpdateCoordinates} 
              disabled={loading || updating}
              variant="outline"
              className="w-full"
              size="lg"
            >
              {updating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Mise à jour en cours...
                </>
              ) : (
                <>
                  <MapPin className="mr-2 h-4 w-4" />
                  Mettre à jour les coordonnées GPS
                </>
              )}
            </Button>

            {updated > 0 && !updating && (
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <p className="text-sm">
                  <strong>{updated}</strong> rue(s) mise(s) à jour
                </p>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Source de données: Base Adresse Nationale (BAN) - © IGN & DGFiP - Données officielles de l'État français
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ImportStreets;