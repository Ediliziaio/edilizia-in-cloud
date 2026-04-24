/**
 * Wrapper SuperAdmin per la sezione Agenti AI.
 *
 * Prima usava il vecchio `@/modules/ai-agents` con sidebar stand-alone che
 * però aveva link hardcoded a `/azienda/marketing/agente-ai/*` → cliccare
 * qualunque tab scarcerava il super-admin dal SuperAdmin portandolo nel
 * lato azienda. Unusable.
 *
 * Ora usa la stessa `AgentiAIPage` lato azienda (8 tab complete: Agenti,
 * Knowledge Base, Telefonia, Chiamate, Chat, Campagne, Statistiche,
 * Crediti) tramite `PlatformCompanyProvider` — stesso pattern degli altri
 * wrapper admin/marketing/*. I link interni ora sono dinamici grazie
 * all'hook `useAiAgentsBasePath` che rileva il contesto corrente.
 *
 * Le due route sono gestite da Routes annidate:
 *   - "/" → lista agenti (AgentiAIPage con i tab)
 *   - "/:agentId" → dettaglio agente (AgentDetailPage)
 */
import { useAdminMarketing } from "@/hooks/useAdminMarketing";
import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
import { Loader2, Bot } from "lucide-react";
import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";

const AgentiAIPage = lazy(() => import("@/pages/azienda/AgentiAIPage"));
const AgentDetailPage = lazy(() => import("@/pages/azienda/AgentDetailPage"));

const LoadingFallback = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function AdminMarketingAgents() {
  const { hasAccess, permLoading } = useAdminMarketing();

  if (permLoading) return <LoadingFallback />;
  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Bot className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h2 className="text-lg font-semibold text-muted-foreground">Accesso negato</h2>
      </div>
    );
  }

  return (
    <PlatformCompanyProvider>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route index element={<AgentiAIPage />} />
          <Route path=":agentId" element={<AgentDetailPage />} />
        </Routes>
      </Suspense>
    </PlatformCompanyProvider>
  );
}
