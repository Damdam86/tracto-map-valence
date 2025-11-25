import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { MapPin, Mail, Lock } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const Auth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");

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

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Check if email is pre-registered
      const { data: invitation } = await supabase
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
          shouldCreateUser: false,
        },
      });

      if (error) throw error;

      setCodeSent(true);
      toast.success("Code envoyé à votre email !");
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'envoi du code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (code.length !== 6) {
      toast.error("Le code doit contenir 6 chiffres");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.toLowerCase().trim(),
        token: code,
        type: 'email',
      });

      if (error) throw error;

      toast.success("Connexion réussie !");
      navigate("/");
    } catch (error: any) {
      toast.error("Code incorrect. Vérifiez votre email.");
    } finally {
      setLoading(false);
    }
  };

  if (codeSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted to-background p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-primary rounded-full">
                <Lock className="w-8 h-8 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Entrez votre code</CardTitle>
            <CardDescription className="text-base">
              Code à 6 chiffres envoyé à <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleVerifyCode} className="space-y-6">
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={(value) => setCode(value)}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <Button type="submit" className="w-full h-12" disabled={loading || code.length !== 6}>
                {loading ? "Vérification..." : "Se connecter"}
              </Button>
            </form>

            <div className="text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                Vous n'avez pas reçu le code ?
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCodeSent(false);
                  setCode("");
                }}
              >
                Renvoyer un code
              </Button>
            </div>
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
          <form onSubmit={handleSendCode} className="space-y-6">
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
                🔐 Connexion instantanée
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Recevez un code à 6 chiffres par email et connectez-vous immédiatement.
              </p>
            </div>

            <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
              {loading ? (
                "Envoi en cours..."
              ) : (
                <>
                  <Mail className="w-5 h-5 mr-2" />
                  Recevoir le code
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
