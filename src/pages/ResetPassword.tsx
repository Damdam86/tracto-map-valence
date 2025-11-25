import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

const ResetPassword = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('reset-user-password', {
        body: { email: email.toLowerCase().trim() }
      });

      if (error) throw error;

      if (data.success) {
        toast.success("Mot de passe réinitialisé avec succès ! Vous pouvez maintenant vous connecter avec le code 123456.");
      } else {
        toast.error(data.error || "Erreur lors de la réinitialisation");
      }
    } catch (error: any) {
      console.error('Reset error:', error);
      toast.error(error.message || "Erreur lors de la réinitialisation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted to-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary rounded-full">
              <KeyRound className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Réinitialiser le mot de passe</CardTitle>
          <CardDescription className="text-base">
            Entrez votre email pour réinitialiser votre mot de passe
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReset} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-base">Adresse email</Label>
              <Input
                id="email"
                type="email"
                placeholder="votre.email@exemple.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 text-base"
                required
                autoFocus
              />
            </div>

            <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
              {loading ? "Réinitialisation..." : "Réinitialiser"}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Après la réinitialisation, vous pourrez vous connecter avec le code 123456
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
