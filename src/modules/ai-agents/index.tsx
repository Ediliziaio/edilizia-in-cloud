import { lazy, Suspense } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AgentSidebar } from "./components/AgentSidebar";
import { AISubscriptionGate } from "./components/AISubscriptionGate";

const AgentsListPage = lazy(() => import("./pages/AgentsListPage"));
const AgentEditorPage = lazy(() => import("./pages/AgentEditorPage"));
const PlatformKnowledgeBasePage = lazy(() => import("./pages/PlatformKnowledgeBasePage"));
const AgentCreditsPage = lazy(() => import("./pages/AgentCreditsPage"));
const AgentPhoneNumbersPage = lazy(() => import("./pages/AgentPhoneNumbersPage"));
const AgentWhatsAppPage = lazy(() => import("./pages/AgentWhatsAppPage"));
const PlatformSettingsPage = lazy(() => import("./pages/PlatformSettingsPage"));

const Fallback = () => (
  <div className="flex items-center justify-center h-full min-h-[200px]">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function AIAgentsModule() {
  const location = useLocation();
  const isEditorPage = /\/agente-ai\/[0-9a-f-]{36}/.test(location.pathname);

  return (
    <AISubscriptionGate>
      <div>
        {!isEditorPage && <AgentSidebar />}
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route index element={<AgentsListPage />} />
            <Route path="knowledge-base" element={<PlatformKnowledgeBasePage />} />
            <Route path="crediti" element={<AgentCreditsPage />} />
            <Route path="numeri-telefono" element={<AgentPhoneNumbersPage />} />
            <Route path="whatsapp" element={<AgentWhatsAppPage />} />
            <Route path="impostazioni" element={<PlatformSettingsPage />} />
            <Route path=":id" element={<AgentEditorPage />} />
          </Routes>
        </Suspense>
      </div>
    </AISubscriptionGate>
  );
}
