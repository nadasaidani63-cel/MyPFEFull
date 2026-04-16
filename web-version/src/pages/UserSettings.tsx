import { useEffect, useMemo, useState } from "react";
import { User, Shield, Bell, Settings, Moon, Sun, Globe, LayoutDashboard, Save, ArrowUpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useCreateRoleRequest, useProfile, useRoleRequests, useUpdateProfile } from "@/hooks/useApiData";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";

const roleLabels: Record<string, string> = {
  admin: "Admin",
  utilisateur: "Utilisateur",
};

const UserSettings = () => {
  const { user, role, setUser, refreshMe } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { data: profile } = useProfile();
  const { data: roleRequests = [] } = useRoleRequests();
  const updateProfile = useUpdateProfile();
  const createRoleRequest = useCreateRoleRequest();

  const [theme, setTheme] = useState<"light" | "dark">(document.documentElement.classList.contains("dark") ? "dark" : "light");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [aiNotifications, setAiNotifications] = useState(true);

  useEffect(() => {
    const source = profile || user;
    if (!source) return;
    setForm({
      firstName: source.firstName || "",
      lastName: source.lastName || "",
      email: source.email || "",
      phone: source.phone || "",
    });
    setEmailAlerts(source.notificationPreferences?.emailOnAlert ?? true);
    setCriticalOnly(source.notificationPreferences?.criticalOnly ?? false);
    setAiNotifications(source.notificationPreferences?.aiNotifications ?? true);
  }, [profile, user]);

  const latestRequest = useMemo(() => roleRequests[0] || null, [roleRequests]);

  const handleSaveProfile = () => {
    updateProfile.mutate(
      {
        ...form,
        preferredLanguage: language,
        notificationPreferences: {
          emailOnAlert: emailAlerts,
          criticalOnly,
          aiNotifications,
        },
      },
      {
        onSuccess: async (data: any) => {
          setUser(data);
          await refreshMe();
          toast({ title: t("profileSaved"), description: `${data.fullName} mis à jour avec succès.` });
        },
        onError: (error: any) => {
          toast({ title: "Erreur", description: error.message, variant: "destructive" });
        },
      }
    );
  };

  const handleSavePreferences = () => {
    updateProfile.mutate(
      {
        preferredLanguage: language,
        notificationPreferences: {
          emailOnAlert: emailAlerts,
          criticalOnly,
          aiNotifications,
        },
      },
      {
        onSuccess: async (data: any) => {
          setUser(data);
          await refreshMe();
          toast({ title: t("preferencesSaved"), description: "Langue et notifications synchronisées." });
        },
        onError: (error: any) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
      }
    );
  };

  const handleRoleRequest = () => {
    createRoleRequest.mutate("Je souhaite participer à l'administration de la plateforme.", {
      onSuccess: () => toast({ title: t("requestSent"), description: "Votre demande a été transmise à l'administrateur." }),
      onError: (error: any) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
    });
  };

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>
        <p className="text-sm text-muted-foreground">Gérer votre profil, vos notifications et vos préférences.</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile" className="gap-1.5"><User className="h-3.5 w-3.5" /> Profil</TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> {t("security")}</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5"><Bell className="h-3.5 w-3.5" /> {t("notifications")}</TabsTrigger>
          <TabsTrigger value="preferences" className="gap-1.5"><Settings className="h-3.5 w-3.5" /> {t("preferences")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informations du Profil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-xl font-bold text-muted-foreground">
                  {form.firstName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U"}
                </div>
                <div>
                  <p className="font-medium text-foreground">{user?.fullName || `${form.firstName} ${form.lastName}`.trim()}</p>
                  <Badge variant="outline" className="mt-1 capitalize">{role ? roleLabels[role] ?? role : "..."}</Badge>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t("firstName")}</Label>
                  <Input id="firstName" value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t("lastName")}</Label>
                  <Input id="lastName" value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t("email")}</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">{t("phone")}</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="+216 XX XXX XXX" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} disabled={updateProfile.isPending}><Save className="h-4 w-4 mr-1" /> {updateProfile.isPending ? "Enregistrement..." : t("save")}</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sécurité & rôle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Rôle actuel</span><Badge variant="outline">{roleLabels[role || "utilisateur"]}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Dernière connexion</span><span>{new Date().toLocaleString(language === "en" ? "en-GB" : "fr-FR")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Préférence langue</span><span className="uppercase">{language}</span></div>
              </div>
              {role === "utilisateur" && (
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <ArrowUpCircle className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">{t("roleRequest")}</p>
                      <p className="text-sm text-muted-foreground">Envoyer une demande à un admin pour devenir administrateur.</p>
                    </div>
                  </div>
                  {latestRequest ? (
                    <Badge variant="outline" className="capitalize">Statut : {latestRequest.status}</Badge>
                  ) : null}
                  <div className="flex justify-end">
                    <Button onClick={handleRoleRequest} disabled={createRoleRequest.isPending || latestRequest?.status === "pending"}>
                      {createRoleRequest.isPending ? "Envoi..." : t("roleRequest")}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Préférences de Notifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Alertes par email</Label>
                  <p className="text-xs text-muted-foreground">Recevoir les alertes par email</p>
                </div>
                <Switch checked={emailAlerts} onCheckedChange={setEmailAlerts} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Critiques uniquement</Label>
                  <p className="text-xs text-muted-foreground">Ne recevoir que les alertes de niveau Alert</p>
                </div>
                <Switch checked={criticalOnly} onCheckedChange={setCriticalOnly} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Notifications IA</Label>
                  <p className="text-xs text-muted-foreground">Prédictions et recommandations de l'IA</p>
                </div>
                <Switch checked={aiNotifications} onCheckedChange={setAiNotifications} />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSavePreferences} disabled={updateProfile.isPending}><Save className="h-4 w-4 mr-1" /> {updateProfile.isPending ? "Enregistrement..." : t("save")}</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Préférences Système</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {theme === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  <div>
                    <Label className="text-sm">Thème</Label>
                    <p className="text-xs text-muted-foreground">{theme === "light" ? "Mode clair" : "Mode sombre"}</p>
                  </div>
                </div>
                <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  <Label className="text-sm">{t("language")}</Label>
                </div>
                <Select value={language} onValueChange={(value: "fr" | "en") => setLanguage(value)}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  <Label className="text-sm">Vue par défaut</Label>
                </div>
                <Select defaultValue="dashboard">
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dashboard">Tableau de bord</SelectItem>
                    <SelectItem value="alerts">Alertes</SelectItem>
                    <SelectItem value="map">Carte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSavePreferences} disabled={updateProfile.isPending}><Save className="h-4 w-4 mr-1" /> {updateProfile.isPending ? "Enregistrement..." : t("save")}</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UserSettings;
