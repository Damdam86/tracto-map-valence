import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface Campaign {
  id: string;
  name: string;
}

interface StreetWithStatus {
  id: string;
  name: string;
  type: string;
  coordinates: number[][] | null;
  segments: Array<{
    id: string;
    status: string;
    number_start: number;
    number_end: number;
  }>;
}

const STATUS_COLORS = {
  todo: "#94a3b8", // Gris
  in_progress: "#3b82f6", // Bleu
  done: "#22c55e", // Vert
  redo: "#f97316", // Orange
  mixed: "#8b5cf6", // Violet pour rues avec plusieurs statuts
};

const MapView = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [streets, setStreets] = useState<StreetWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const polylinesRef = useRef<L.Polyline[]>([]);
  
  // Coordonnées de Portes-lès-Valence
  const center: [number, number] = [44.8771, 4.8772];

  useEffect(() => {
    fetchCampaigns();
  }, []);

  useEffect(() => {
    if (selectedCampaign) {
      fetchStreetStatuses();
    }
  }, [selectedCampaign]);

  useEffect(() => {
    // Initialize map
    if (mapContainerRef.current && !mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current).setView(center, 14);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapRef.current);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Update polylines when streets change
    if (mapRef.current && streets.length > 0) {
      // Remove old polylines
      polylinesRef.current.forEach(polyline => {
        mapRef.current?.removeLayer(polyline);
      });
      polylinesRef.current = [];

      // Add new polylines
      streets.forEach((street) => {
        // Skip streets without coordinates
        if (!street.coordinates || street.coordinates.length === 0) {
          return;
        }

        // Convert coordinates to Leaflet format [lat, lng]
        const line: [number, number][] = street.coordinates.map(coord => [coord[0], coord[1]]);
        
        const polyline = L.polyline(line, {
          color: getStreetColor(street),
          weight: 4,
          opacity: 0.8,
        }).addTo(mapRef.current!);

        // Calculate min and max numbers for this street
        const allNumbers = street.segments.flatMap(s => [s.number_start, s.number_end]);
        const minNumber = Math.min(...allNumbers);
        const maxNumber = Math.max(...allNumbers);
        
        polyline.bindTooltip(
          `<strong>${street.name}</strong><br/>${getStreetStatus(street)}<br/>N° ${minNumber} à ${maxNumber} (${street.segments.length} segment${street.segments.length > 1 ? 's' : ''})`,
          { direction: 'top' }
        );

        polylinesRef.current.push(polyline);
      });
    }
  }, [streets]);

  const fetchCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, status")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
      
      // Auto-select first ongoing campaign
      const ongoingCampaign = data?.find((c: any) => c.status === "ongoing");
      if (ongoingCampaign) {
        setSelectedCampaign(ongoingCampaign.id);
      } else if (data && data.length > 0) {
        setSelectedCampaign(data[0].id);
      }
    } catch (error: any) {
      toast.error("Erreur lors du chargement des campagnes");
    } finally {
      setLoading(false);
    }
  };

  const fetchStreetStatuses = async () => {
    if (!selectedCampaign) return;

    try {
      // Get all campaign_segments for this campaign with their segments and streets
      const { data: campaignSegments, error } = await supabase
        .from("campaign_segments")
        .select(`
          id,
          status,
          segment:segments (
            id,
            number_start,
            number_end,
            street:streets (
              id,
              name,
              type,
              coordinates
            )
          )
        `)
        .eq("campaign_id", selectedCampaign);

      if (error) throw error;

      // Group by street
      const streetsMap = new Map<string, StreetWithStatus>();
      
      (campaignSegments || []).forEach((cs: any) => {
        if (!cs.segment?.street) return;
        
        const streetId = cs.segment.street.id;
        
        if (!streetsMap.has(streetId)) {
          streetsMap.set(streetId, {
            id: streetId,
            name: cs.segment.street.name,
            type: cs.segment.street.type,
            coordinates: cs.segment.street.coordinates,
            segments: [],
          });
        }
        
        streetsMap.get(streetId)!.segments.push({
          id: cs.segment.id,
          status: cs.status,
          number_start: cs.segment.number_start,
          number_end: cs.segment.number_end,
        });
      });

      setStreets(Array.from(streetsMap.values()));
    } catch (error: any) {
      console.error("Error fetching street statuses:", error);
      toast.error("Erreur lors du chargement des statuts");
    }
  };

  const getStreetColor = (street: StreetWithStatus) => {
    if (street.segments.length === 0) return STATUS_COLORS.todo;
    
    const statuses = new Set(street.segments.map(s => s.status));
    
    if (statuses.size === 1) {
      return STATUS_COLORS[street.segments[0].status as keyof typeof STATUS_COLORS];
    }
    
    // Rue avec plusieurs statuts
    if (statuses.has("done") && statuses.size > 1) return STATUS_COLORS.mixed;
    if (statuses.has("in_progress")) return STATUS_COLORS.in_progress;
    if (statuses.has("redo")) return STATUS_COLORS.redo;
    
    return STATUS_COLORS.todo;
  };

  const getStreetStatus = (street: StreetWithStatus) => {
    if (street.segments.length === 0) return "Non assignée";
    
    const statuses = new Set(street.segments.map(s => s.status));
    
    if (statuses.size === 1) {
      const labels: Record<string, string> = {
        todo: "À faire",
        in_progress: "En cours",
        done: "Terminé",
        redo: "À refaire",
      };
      return labels[street.segments[0].status] || street.segments[0].status;
    }
    
    return "Statut mixte";
  };

  const stats = {
    total: streets.length,
    done: streets.filter(s => s.segments.every(seg => seg.status === "done")).length,
    inProgress: streets.filter(s => s.segments.some(seg => seg.status === "in_progress")).length,
    todo: streets.filter(s => s.segments.every(seg => seg.status === "todo")).length,
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Carte de suivi</h1>
          <p className="text-muted-foreground">
            Visualisez la progression du tractage en temps réel
          </p>
        </div>
        <div className="w-full md:w-64">
          <Label>Campagne</Label>
          <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionnez une campagne" />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total rues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: STATUS_COLORS.done }} />
              Terminées
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.done}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: STATUS_COLORS.in_progress }} />
              En cours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inProgress}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: STATUS_COLORS.todo }} />
              À faire
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.todo}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Carte de Portes-lès-Valence</CardTitle>
          <CardDescription>Visualisation principale de la progression du tractage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:flex md:flex-wrap gap-3 md:gap-4 mb-4 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: STATUS_COLORS.todo }} />
              <span className="text-xs md:text-sm">À faire</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: STATUS_COLORS.in_progress }} />
              <span className="text-xs md:text-sm">En cours</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: STATUS_COLORS.done }} />
              <span className="text-xs md:text-sm">Terminé</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: STATUS_COLORS.redo }} />
              <span className="text-xs md:text-sm">À refaire</span>
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: STATUS_COLORS.mixed }} />
              <span className="text-xs md:text-sm">Statut mixte</span>
            </div>
          </div>
          <div 
            ref={mapContainerRef}
            className="w-full h-[75vh] md:h-[calc(100vh-400px)] min-h-[500px] rounded-lg overflow-hidden border"
          />
          <p className="text-xs md:text-sm text-muted-foreground mt-4">
            Touchez/cliquez sur une rue pour voir son nom et sa progression
          </p>
          <p className="text-sm text-muted-foreground mt-4">
            Note: Cette carte affiche des tracés simplifiés. Pour obtenir les coordonnées réelles des rues, 
            utilisez la fonction d'import depuis OpenStreetMap dans la page Rues & Segments.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default MapView;
