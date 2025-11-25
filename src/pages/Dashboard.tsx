import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { MapPin, Target, Users, CheckCircle2 } from "lucide-react";

interface DashboardStats {
  totalCampaigns: number;
  activeCampaigns: number;
  totalSegments: number;
  completedSegments: number;
  totalVolunteers: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalCampaigns: 0,
    activeCampaigns: 0,
    totalSegments: 0,
    completedSegments: 0,
    totalVolunteers: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const [campaignsRes, segmentsRes, volunteersRes] = await Promise.all([
        supabase.from("campaigns").select("id, status"),
        supabase.from("campaign_segments").select("id, status"),
        supabase.from("profiles").select("id"),
      ]);

      const totalCampaigns = campaignsRes.data?.length || 0;
      const activeCampaigns = campaignsRes.data?.filter(c => c.status === "ongoing").length || 0;
      const totalSegments = segmentsRes.data?.length || 0;
      const completedSegments = segmentsRes.data?.filter(s => s.status === "done").length || 0;
      const totalVolunteers = volunteersRes.data?.length || 0;

      setStats({
        totalCampaigns,
        activeCampaigns,
        totalSegments,
        completedSegments,
        totalVolunteers,
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const completionPercentage = stats.totalSegments > 0 
    ? Math.round((stats.completedSegments / stats.totalSegments) * 100) 
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-lg md:text-xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tableau de bord</h1>
        <p className="text-base md:text-lg text-muted-foreground font-semibold">
          Vue d'ensemble de vos campagnes de tractage
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base md:text-lg font-semibold">
              Campagnes actives
            </CardTitle>
            <Target className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeCampaigns}</div>
            <p className="text-sm text-muted-foreground font-semibold">
              Sur {stats.totalCampaigns} au total
            </p>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base md:text-lg font-semibold">
              Segments
            </CardTitle>
            <MapPin className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSegments}</div>
            <p className="text-sm text-muted-foreground font-semibold">
              Segments de rues assignés
            </p>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base md:text-lg font-semibold">
              Avancement
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success-green" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completionPercentage}%</div>
            <Progress value={completionPercentage} className="mt-2" />
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base md:text-lg font-semibold">
              Bénévoles
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalVolunteers}</div>
            <p className="text-sm text-muted-foreground font-semibold">
              Inscrits sur la plateforme
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="text-xl font-bold">Campagnes en cours</CardTitle>
            <CardDescription className="text-base font-semibold">
              Les campagnes actives nécessitant votre attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.activeCampaigns === 0 ? (
                <p className="text-base text-muted-foreground font-semibold">
                  Aucune campagne active pour le moment
                </p>
              ) : (
                <p className="text-base text-muted-foreground font-semibold">
                  {stats.activeCampaigns} campagne(s) en cours
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardHeader>
            <CardTitle className="text-xl font-bold">Progression globale</CardTitle>
            <CardDescription className="text-base font-semibold">
              Avancement de la distribution de tracts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold">Segments complétés</span>
                <Badge variant="secondary">
                  {stats.completedSegments} / {stats.totalSegments}
                </Badge>
              </div>
              <Progress value={completionPercentage} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;