import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { MapPin, Mail, CheckCircle2 } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/");
      }
    };
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        toast.success("Bienvenue !");
        navigate("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Check if email is pre-registered
      const { data: invitation, error: inviteError } = await supabase
        .from("volunteer_invitations")
        .select("email")
        .eq("email", email.toLowerCase().trim())
        .maybeSingle();

      if (!invitation) {
        toast.error("Cette adresse email n'est pas autorisée. Contactez votre coordinateur.");
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase().trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      setEmailSent(true);
      toast.success("Email envoyé ! Vérifiez votre boîte de réception.");
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'envoi de l'email");
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted to-background p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-green-500 rounded-full">
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Email envoyé !</CardTitle>
            <CardDescription className="text-base">
              Nous avons envoyé un lien de connexion à <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
              <p className="font-medium">📧 Vérifiez votre boîte de réception</p>
              <p className="text-muted-foreground">
                Cliquez sur le lien dans l'email pour vous connecter automatiquement.
              </p>
              <p className="text-muted-foreground text-xs mt-3">
                💡 Astuce : Si vous ne voyez pas l'email, vérifiez vos spams
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setEmailSent(false);
                setEmail("");
              }}
            >
              Renvoyer un email
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted to-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary rounded-full">
              <MapPin className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Tractage Portes-lès-Valence</CardTitle>
          <CardDescription className="text-base">
            Connexion simple et sécurisée par email
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleMagicLink} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-base">Votre adresse email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="votre.email@exemple.fr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-12 text-base"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                🔐 Connexion sans mot de passe
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Entrez votre email et nous vous enverrons un lien de connexion magique. 
                Pas besoin de retenir un mot de passe !
              </p>
            </div>

            <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
              {loading ? (
                "Envoi en cours..."
              ) : (
                <>
                  <Mail className="w-5 h-5 mr-2" />
                  Recevoir le lien de connexion
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Votre email doit être pré-enregistré par un coordinateur pour accéder à l'application
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
