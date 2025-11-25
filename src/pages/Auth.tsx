import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import logo from "@/assets/logo.png";
import { useTextSize } from "@/hooks/useTextSize";

const FIXED_CODE = "123456"; // Code fixe pour tous les utilisateurs

const Auth = () => {
  const navigate = useNavigate();
  const { textSize, toggleTextSize, textSizeClass } = useTextSize();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (code.length !== 6) {
      toast.error("Le code doit contenir 6 chiffres");
      return;
    }

    if (code !== FIXED_CODE) {
      toast.error("Code incorrect");
      return;
    }

    setLoading(true);

    try {
      // Try to sign in first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password: FIXED_CODE,
      });

      if (signInError) {
        // If sign in fails, try to create account
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.toLowerCase().trim(),
          password: FIXED_CODE,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (signUpError?.message?.includes("already registered")) {
          toast.error(
            "Votre compte existe déjà avec un autre mot de passe. Demandez au coordinateur de le réinitialiser.",
            { duration: 6000 }
          );
          setLoading(false);
          return;
        }

        if (signUpError) throw signUpError;

        toast.success("Compte créé avec succès !");
      } else {
        toast.success("Connexion réussie !");
      }

      navigate("/");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Erreur lors de la connexion. Vérifiez votre connexion internet et réessayez."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted to-background p-4 ${textSizeClass}`}>
      <Card className="w-full max-w-md shadow-lg border-2">
        <CardHeader className="space-y-3 text-center">
          <div className="flex justify-center mb-4">
            <img src={logo} alt="Agir Mieux Vivre" className="w-32 h-32 object-contain" />
          </div>
          <CardTitle className="text-3xl font-extrabold">Tractage Portes-lès-Valence</CardTitle>
          <CardDescription className="text-lg font-medium text-foreground">
            Connexion instantanée avec le code communiqué (pas de mail à attendre)
          </CardDescription>
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={toggleTextSize} className="text-base font-semibold">
              {textSize === "large" ? "Texte normal" : "Agrandir le texte"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-8">
            <div className="space-y-3">
              <Label htmlFor="email" className="text-lg font-semibold">Votre adresse email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="votre.email@exemple.fr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-14 text-lg font-medium"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="code" className="text-lg font-semibold">Code de connexion</Label>
                <span className="text-sm text-muted-foreground">6 chiffres</span>
              </div>
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
            </div>

            <div className="bg-blue-50 dark:bg-blue-950 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-5 space-y-3">
              <p className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                🔐 Connexion simplifiée
              </p>
              <p className="text-base text-blue-700 dark:text-blue-300">
                Entrez votre email habituel puis le code fixe communiqué à l'équipe. Nous créons ou réutilisons votre accès automatiquement.
              </p>
              <a
                href="mailto:coordinateur@campagne.fr"
                className="text-base font-semibold text-blue-900 underline"
              >
                Besoin d'aide ? Appelez ou écrivez à votre coordinateur
              </a>
            </div>

            <Button type="submit" className="w-full h-14 text-lg font-bold" disabled={loading || code.length !== 6}>
              {loading ? "Connexion..." : "Se connecter"}
            </Button>

            <p className="text-base text-center text-muted-foreground">
              Astuce : gardez le code à portée de main, c'est le seul élément demandé pour vous connecter.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
