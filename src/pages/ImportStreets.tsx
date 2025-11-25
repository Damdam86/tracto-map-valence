import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, MapPin, AlertCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const ImportStreets = () => {
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [imported, setImported] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [updated, setUpdated] = useState(0);

  const handleImport = async () => {
    setLoading(true);
    setProgress(0);
    setImported(0);
    setSkipped(0);

    try {
      toast.info("Récupération des rues depuis la Base Adresse Nationale...");
      toast.info("⏳ Téléchargement du fichier BAN (peut prendre 1-2 minutes)...");
      
      // Call edge function to import BAN data
      const { data, error } = await supabase.functions.invoke('import-ban-streets');
      
      if (error) {
        throw new Error(error.message || "Erreur lors de l'import BAN");
      }
      
      if (!data) {
        toast.warning("Aucune donnée reçue");
        setLoading(false);
        return;
      }
      
      setImported(data.imported || 0);
      setSkipped(data.skipped || 0);
      setProgress(100);
      
      const osmAddedText = data.osmAdded ? `, ${data.osmAdded} complétée(s) depuis OSM` : '';
      toast.success(
        `Import terminé ! ${data.imported} rue(s) BAN importée(s), ${data.updated} mise(s) à jour${osmAddedText}, ${data.skipped} ignorée(s)`
      );

    } catch (error: any) {
      console.error("Import error:", error);
      toast.error("Erreur lors de l'import: " + (error?.message || "Erreur inconnue"));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCoordinates = async () => {
    setUpdating(true);
    setProgress(0);
    setUpdated(0);

    try {
      toast.info("Mise à jour des coordonnées via l'edge function...");
      
      // Call the same edge function - it will update existing streets
      const { data, error } = await supabase.functions.invoke('import-ban-streets');
      
      if (error) {
        throw new Error(error.message || "Erreur lors de la mise à jour");
      }
      
      if (!data) {
        toast.warning("Aucune donnée reçue");
        setUpdating(false);
        return;
      }
      
      setUpdated(data.updated || 0);
      setProgress(100);
      
      toast.success(`${data.updated} rue(s) mise(s) à jour avec les coordonnées GPS !`);
    } catch (error: any) {
      console.error("Update error:", error);
      toast.error("Erreur lors de la mise à jour: " + (error?.message || "Erreur inconnue"));
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
                  <li>Télécharge le fichier CSV officiel BAN de la Drôme (département 26)</li>
                  <li>Filtre automatiquement pour Portes-lès-Valence (INSEE: 26252)</li>
                  <li>Extrait toutes les voies avec leurs coordonnées GPS précises</li>
                  <li>Récupère les numéros de maison officiels pour chaque rue</li>
                  <li>Crée automatiquement les segments (par tranches de 50 numéros)</li>
                  <li>Données 100% officielles et exhaustives (IGN + DGFiP)</li>
                  <li>⏱️ L'import prend 1-2 minutes (téléchargement + traitement)</li>
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