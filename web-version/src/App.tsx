import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { DatacenterProvider } from "@/hooks/useDatacenter";
import { LanguageProvider } from "@/hooks/useLanguage";
import { AppLayout } from "@/components/layout/AppLayout";
import Login from "./pages/Login";
import VerifyEmail from "./pages/VerifyEmail";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import DataCenters from "./pages/DataCenters";
import Overview from "./pages/Overview";
import Alerts from "./pages/Alerts";
import AIAssistant from "./pages/AIAssistant";
import DatacenterInfo from "./pages/DatacenterInfo";
import ZoneDetails from "./pages/ZoneDetails";
import UserSettings from "./pages/UserSettings";
import AdminUsers from "./pages/AdminUsers";
import History from "./pages/History";
import Thresholds from "./pages/Thresholds";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <LanguageProvider>
        <BrowserRouter>
          <AuthProvider>
            <DatacenterProvider>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route element={<AppLayout />}>
                  <Route path="/" element={<DataCenters />} />
                  <Route path="/datacenters" element={<DataCenters />} />
                  <Route path="/surveillance" element={<Dashboard />} />
                  <Route path="/overview" element={<Overview />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/ai" element={<AIAssistant />} />
                  <Route path="/datacenter" element={<DatacenterInfo />} />
                  <Route path="/zones/:zoneId" element={<ZoneDetails />} />
                  <Route path="/settings" element={<UserSettings />} />
                  <Route path="/admin/users" element={<AdminUsers />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/thresholds" element={<Thresholds />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </DatacenterProvider>
          </AuthProvider>
        </BrowserRouter>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
