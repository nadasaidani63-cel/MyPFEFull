import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "fr" | "en";

const STORAGE_KEY = "sentinel_language";

const dictionaries = {
  fr: {
    dashboard: "Tableau de bord",
    liveOverview: "Vue temps réel des métriques",
    currentValue: "Valeur actuelle",
    status: "Statut",
    normal: "Normal",
    warning: "Warning",
    alert: "Alert",
    online: "En ligne",
    offline: "Hors ligne",
    noHub: "Aucun hub connecté",
    profileSaved: "Profil mis à jour",
    preferencesSaved: "Préférences sauvegardées",
    save: "Sauvegarder",
    update: "Mettre à jour",
    login: "Connexion",
    signup: "Inscription",
    firstName: "Prénom",
    lastName: "Nom",
    phone: "Téléphone",
    email: "Email",
    password: "Mot de passe",
    security: "Sécurité",
    notifications: "Notifications",
    preferences: "Préférences",
    language: "Langue",
    roleRequest: "Demande d'élévation",
    requestSent: "Demande envoyée",
    users: "Utilisateurs",
    role: "Rôle",
    admin: "Admin",
    user: "Utilisateur",
    history: "Historique",
  },
  en: {
    dashboard: "Dashboard",
    liveOverview: "Live metrics overview",
    currentValue: "Current value",
    status: "Status",
    normal: "Normal",
    warning: "Warning",
    alert: "Alert",
    online: "Online",
    offline: "Offline",
    noHub: "No hub connected",
    profileSaved: "Profile updated",
    preferencesSaved: "Preferences saved",
    save: "Save",
    update: "Update",
    login: "Login",
    signup: "Sign up",
    firstName: "First name",
    lastName: "Last name",
    phone: "Phone",
    email: "Email",
    password: "Password",
    security: "Security",
    notifications: "Notifications",
    preferences: "Preferences",
    language: "Language",
    roleRequest: "Elevation request",
    requestSent: "Request submitted",
    users: "Users",
    role: "Role",
    admin: "Admin",
    user: "User",
    history: "History",
  },
} as const;

type DictionaryKey = keyof typeof dictionaries.fr;

type LanguageContextType = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: DictionaryKey) => string;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "en" ? "en" : "fr";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
    window.dispatchEvent(new CustomEvent("sentinel-language-changed", { detail: language }));
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage: (next: Language) => setLanguageState(next),
      t: (key: DictionaryKey) => dictionaries[language][key] ?? key,
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}
