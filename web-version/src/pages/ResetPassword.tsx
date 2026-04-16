import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Activity } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ResetPassword() {
  const { user, loading, requestPasswordReset, resetPassword } = useAuth();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const tokenFromUrl = params.get("token") || "";
  const emailFromUrl = params.get("email") || "";

  const [mode, setMode] = useState<"request" | "reset">(tokenFromUrl && emailFromUrl ? "reset" : "request");
  const [requestEmail, setRequestEmail] = useState(emailFromUrl);
  const [resetEmail, setResetEmail] = useState(emailFromUrl);
  const [resetTokenValue, setResetTokenValue] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (tokenFromUrl && emailFromUrl) {
      setMode("reset");
      setResetEmail(emailFromUrl);
      setResetTokenValue(tokenFromUrl);
      setRequestEmail(emailFromUrl);
    }
  }, [tokenFromUrl, emailFromUrl]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Activity className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error, message } = await requestPasswordReset(requestEmail);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Email envoyé", description: message || "Vérifie ta boîte mail." });
      setMode("reset");
      setResetEmail(requestEmail);
    }
    setIsSubmitting(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: "Mot de passe invalide", description: "Le mot de passe doit contenir au moins 6 caractères.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Confirmation invalide", description: "Les mots de passe ne correspondent pas.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    const { error, message } = await resetPassword({
      email: resetEmail,
      token: resetTokenValue,
      newPassword,
    });
    if (error) {
      toast({ title: "Échec de réinitialisation", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Mot de passe réinitialisé", description: message || "Tu peux maintenant te connecter." });
      setNewPassword("");
      setConfirmPassword("");
    }
    setIsSubmitting(false);
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary/80" />
        <div className="relative z-10 text-center px-12">
          <div className="h-16 w-16 rounded-2xl bg-primary-foreground/20 flex items-center justify-center mx-auto mb-8">
            <Activity className="h-10 w-10 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-bold text-primary-foreground mb-4">Ooredoo<br />Datacenter</h1>
          <p className="text-xl text-primary-foreground/80 mb-2">Réinitialisation sécurisée</p>
          <p className="text-primary-foreground/60 text-sm max-w-md mx-auto">
            Demande un lien de réinitialisation ou définis un nouveau mot de passe à partir du lien reçu par email.
          </p>
        </div>
      </div>

      <div className="flex w-full lg:w-1/2 items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted p-1">
            <Button type="button" variant={mode === "request" ? "default" : "ghost"} onClick={() => setMode("request")}>Demander</Button>
            <Button type="button" variant={mode === "reset" ? "default" : "ghost"} onClick={() => setMode("reset")}>Réinitialiser</Button>
          </div>

          {mode === "request" ? (
            <Card>
              <CardHeader>
                <CardTitle>Mot de passe oublié</CardTitle>
                <CardDescription>Entre ton email pour recevoir un lien de réinitialisation.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRequestReset} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="request-email">Email</Label>
                    <Input id="request-email" type="email" placeholder="vous@ooredoo.tn" value={requestEmail} onChange={(e) => setRequestEmail(e.target.value)} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? "Envoi..." : "Envoyer le lien"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Nouveau mot de passe</CardTitle>
                <CardDescription>Utilise le lien reçu par email ou colle le code de réinitialisation.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input id="reset-email" type="email" placeholder="vous@ooredoo.tn" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-token">Code / token</Label>
                    <Input id="reset-token" placeholder="Colle le token reçu par email" value={resetTokenValue} onChange={(e) => setResetTokenValue(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Nouveau mot de passe</Label>
                    <Input id="new-password" type="password" placeholder="Min. 6 caractères" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
                    <Input id="confirm-password" type="password" placeholder="Répéter le nouveau mot de passe" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? "Réinitialisation..." : "Mettre à jour le mot de passe"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <Link to="/login" className="hover:text-foreground underline underline-offset-4">Retour à la connexion</Link>
            <button type="button" className="hover:text-foreground underline underline-offset-4" onClick={() => setMode(mode === "request" ? "reset" : "request")}>{mode === "request" ? "J'ai déjà un lien" : "Redemander un lien"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
