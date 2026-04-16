import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Activity } from "lucide-react";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const email = params.get("email");

  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const run = async () => {
      if (!token || !email) {
        setState("error");
        setMessage("Lien invalide (token/email manquants).");
        return;
      }
      try {
        const res = await apiFetch<{ success: boolean; message: string }>(
          `/auth/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
          { auth: false }
        );
        setState("success");
        setMessage(res.message || "Email vérifié.");
      } catch (e: any) {
        setState("error");
        setMessage(e.message || "Échec de vérification.");
      }
    };
    run();
  }, [token, email]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Vérification Email</CardTitle>
          <CardDescription>Activation de ton compte Sentinel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "loading" && (
            <div className="flex items-center gap-3 text-muted-foreground">
              <Activity className="h-5 w-5 animate-spin" />
              <span>Vérification en cours...</span>
            </div>
          )}

          {state === "success" && (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-500 mt-0.5" />
              <div>
                <div className="font-medium">Succès</div>
                <div className="text-sm text-muted-foreground">{message}</div>
              </div>
            </div>
          )}

          {state === "error" && (
            <div className="flex items-start gap-3">
              <XCircle className="h-6 w-6 text-red-500 mt-0.5" />
              <div>
                <div className="font-medium">Erreur</div>
                <div className="text-sm text-muted-foreground">{message}</div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button asChild>
              <Link to="/login">Aller à la connexion</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/">Accueil</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
