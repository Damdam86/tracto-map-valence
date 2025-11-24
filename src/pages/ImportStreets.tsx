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
    // Requête Overpass API pour récupérer toutes les rues de Portes-lès-Valence
    const query = `
      [out:json][timeout:30];
      area["name"="Portes-lès-Valence"]["admin_level"="8"]->.a;
      (
        way["highway"]["name"](area.a);
      );
      out body;
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

  const handleImport = async () => {
    setLoading(true);
    setProgress(0);
    setImported(0);
    setSkipped(0);

    try {
      toast.info("Récupération des rues depuis OpenStreetMap...");
      
      const streets = await fetchStreetsFromOverpass();
      
      if (streets.length === 0) {
        toast.warning("Aucune rue trouvée");
        setLoading(false);
        return;
      }

      toast.info(`${streets.length} rues trouvées, importation en cours...`);

      // Get existing streets to avoid duplicates
      const { data: existingStreets } = await supabase
        .from("streets")
        .select("name");
      
      const existingNames = new Set(existingStreets?.map(s => s.name) || []);

      let importedCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < streets.length; i++) {
        const street = streets[i];
        const streetName = street.tags.name;
        const streetType = street.tags.highway;

        if (!streetName || !streetType) {
          skippedCount++;
          continue;
        }

        // Skip if already exists
        if (existingNames.has(streetName)) {
          skippedCount++;
          setProgress(((i + 1) / streets.length) * 100);
          continue;
        }

        // Insert street
        const { error } = await supabase
          .from("streets")
          .insert({
            name: streetName,
            type: getStreetType(streetType),
            district: "Importé",
            neighborhood: "OpenStreetMap",
          });

        if (!error) {
          importedCount++;
          existingNames.add(streetName);
        } else {
          skippedCount++;
        }

        setImported(importedCount);
        setSkipped(skippedCount);
        setProgress(((i + 1) / streets.length) * 100);

        // Small delay to avoid overwhelming the UI
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      toast.success(`Import terminé ! ${importedCount} rue(s) importée(s), ${skippedCount} ignorée(s)`);
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
                  <li>Les rues déjà présentes dans la base sont ignorées</li>
                  <li>Les nouvelles rues sont automatiquement classées par type</li>
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