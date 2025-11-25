import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, Circle } from "lucide-react";

interface AssignedSegment {
  id: string;
  status: string;
  campaign: {
    name: string;
  };
  segment: {
    id: string;
    number_start: number;
    number_end: number;
    side: string;
    street: {
      name: string;
      type: string;
    };
  };
}

const VolunteerSimple = () => {
  const { user } = useAuth();
  const [segments, setSegments] = useState<AssignedSegment[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchAssignedSegments();
      const tutorialSeen = localStorage.getItem("volunteer-simple-tutorial");
      if (!tutorialSeen) {
        setShowTutorial(true);
      }
    }
  }, [user]);

  const fetchAssignedSegments = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("campaign_segments")
        .select(`
          id,
          status,
          campaign:campaigns(name),
          segment:segments(
            id,
            number_start,
            number_end,
            side,
            street:streets(name, type)
          )
        `)
        .eq("assigned_to_user_id", user.id)
        .order("status");

      if (error) throw error;
      setSegments(data || []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur lors du chargement";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const updateSegmentStatus = async (newStatus: "done" | "in_progress") => {
    if (!user || segments.length === 0) return;

    const currentSegment = segments[currentIndex];
    setUpdating(true);

    try {
      const { error: updateError } = await supabase
        .from("campaign_segments")
        .update({ 
          status: newStatus,
          last_update_date: new Date().toISOString()
        })
        .eq("id", currentSegment.id);

      if (updateError) throw updateError;

      if (newStatus === "done") {
        const { error: actionError } = await supabase
          .from("tract_actions")
          .insert({
            user_id: user.id,
            campaign_id: currentSegment.campaign as any,
            segment_id: currentSegment.segment.id,
            coverage_level: "full",
          });

        if (actionError) throw actionError;
      }

      toast.success(newStatus === "done" ? "Segment terminé !" : "Segment commencé");
      await fetchAssignedSegments();
      
      // Move to next segment if marked as done
      if (newStatus === "done" && currentIndex < segments.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur lors de la mise à jour";
      toast.error(message);
    } finally {
      setUpdating(false);
    }
  };

  const getSideLabel = (side: string) => {
    const labels: Record<string, string> = {
      even: "Numéros pairs",
      odd: "Numéros impairs",
      both: "Tous les numéros",
    };
    return labels[side] || side;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "done":
        return <CheckCircle2 className="w-12 h-12 text-green-500" />;
      case "in_progress":
        return <Clock className="w-12 h-12 text-blue-500" />;
      default:
        return <Circle className="w-12 h-12 text-gray-400" />;
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < segments.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const dismissTutorial = () => {
    setShowTutorial(false);
    localStorage.setItem("volunteer-simple-tutorial", "seen");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary"></div>
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <Circle className="w-20 h-20 text-muted-foreground mb-6" />
        <h2 className="text-3xl font-bold text-center mb-4">
          Aucun segment assigné
        </h2>
        <p className="text-xl text-center text-muted-foreground max-w-md">
          Contactez votre coordinateur pour recevoir des segments à tracter
        </p>
      </div>
    );
  }

  const currentSegment = segments[currentIndex];
  const isDone = currentSegment.status === "done";
  const isInProgress = currentSegment.status === "in_progress";
  const isTodo = currentSegment.status === "todo";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {showTutorial && (
          <Card className="flex-1 border-2 border-primary/50 bg-primary/5">
            <CardContent className="space-y-3 p-4">
              <p className="text-lg font-bold">Bienvenue sur "Ma campagne"</p>
              <ol className="space-y-2 text-base list-decimal list-inside">
                <li>Appuyez sur "Je commence" pour démarrer la distribution.</li>
                <li>Distribuez les tracts sur le tronçon affiché.</li>
                <li>Validez avec "✓ C'est fait !" pour passer au suivant.</li>
              </ol>
              <div className="flex justify-end">
                <Button size="sm" onClick={dismissTutorial} className="text-base font-semibold">
                  Compris
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="self-start text-base font-semibold">
              Besoin d'aide ?
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Questions rapides</DialogTitle>
              <DialogDescription className="text-base">
                Réponses en 10 secondes et contact coordinateur.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-base">
              <div>
                <p className="font-semibold">Comment changer de segment ?</p>
                <p>Utilisez les flèches ou le bouton "Segment suivant" après validation.</p>
              </div>
              <div>
                <p className="font-semibold">Je n'ai plus de tracts.</p>
                <p>Contactez le coordinateur pour réassort et laissez le segment en "À faire".</p>
              </div>
              <div>
                <p className="font-semibold">Erreur de rue ou de numéro ?</p>
                <p>Revenez en arrière et validez seulement après avoir couvert le bon tronçon.</p>
              </div>
              <a
                href="mailto:coordinateur@campagne.fr"
                className="font-semibold text-primary underline"
              >
                Joindre le coordinateur (email)
              </a>
            </div>
            <DialogFooter>
              <Button onClick={() => setHelpOpen(false)} className="text-base font-semibold">Fermer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Progress indicator */}
      <div className="mb-2 text-center">
        <p className="text-2xl font-semibold text-muted-foreground">
          Segment {currentIndex + 1} sur {segments.length}
        </p>
        <div className="w-full bg-muted rounded-full h-3 mt-3">
          <div
            className="bg-primary h-3 rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / segments.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Main card */}
      <Card className="relative overflow-hidden border-4">
        {/* Navigation arrows */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-16 w-16 rounded-full shadow-lg bg-background/90 hover:bg-background disabled:opacity-30"
          onClick={goToPrevious}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="h-10 w-10" />
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-16 w-16 rounded-full shadow-lg bg-background/90 hover:bg-background disabled:opacity-30"
          onClick={goToNext}
          disabled={currentIndex === segments.length - 1}
        >
          <ChevronRight className="h-10 w-10" />
        </Button>

        <CardContent className="p-8 md:p-12 space-y-8">
          {/* Status icon */}
          <div className="flex justify-center">
            {getStatusIcon(currentSegment.status)}
          </div>

          {/* Street name */}
          <div className="text-center space-y-2">
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              {currentSegment.segment.street.name}
            </h1>
          </div>

          {/* Numbers */}
          <div className="bg-muted rounded-2xl p-6 text-center space-y-3">
            <p className="text-3xl md:text-4xl font-bold">
              N° {currentSegment.segment.number_start} à {currentSegment.segment.number_end}
            </p>
            <p className="text-xl md:text-2xl text-muted-foreground">
              {getSideLabel(currentSegment.segment.side)}
            </p>
          </div>

          {/* Campaign name */}
          <div className="text-center">
            <p className="text-lg text-muted-foreground">Campagne</p>
            <p className="text-2xl font-semibold mt-1">
              {currentSegment.campaign.name}
            </p>
          </div>

          {/* Action buttons */}
          <div className="space-y-4 pt-4">
            {isDone ? (
              <div className="text-center space-y-4">
                <div className="bg-green-50 dark:bg-green-950 border-2 border-green-500 rounded-xl p-6">
                  <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-3" />
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                    Segment terminé !
                  </p>
                </div>
                {currentIndex < segments.length - 1 && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full h-16 text-xl"
                    onClick={goToNext}
                  >
                    Segment suivant →
                  </Button>
                )}
              </div>
            ) : (
              <>
                {(isTodo || isInProgress) && (
                  <Button
                    size="lg"
                    className="w-full h-20 text-2xl font-bold bg-green-600 hover:bg-green-700 text-white shadow-lg"
                    onClick={() => updateSegmentStatus("done")}
                    disabled={updating}
                  >
                    {updating ? "Enregistrement..." : "✓ C'est fait !"}
                  </Button>
                )}
                
                {isTodo && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full h-16 text-xl border-2"
                    onClick={() => updateSegmentStatus("in_progress")}
                    disabled={updating}
                  >
                    Je commence
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Help text */}
      <p className="text-center text-lg text-muted-foreground mt-6">
        Utilisez les flèches ← → pour naviguer entre vos segments
      </p>
    </div>
  );
};

export default VolunteerSimple;
