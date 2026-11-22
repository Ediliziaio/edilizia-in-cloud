import { FishOnboardingWizard } from "@/components/agenti/FishOnboardingWizard";
import { Link, Navigate, useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { WorkspaceTabs } from "@/components/ui/workspace-tabs";
import {
  Bot,
  BookOpen,
  Phone,
  Megaphone,
  MessageSquare,
  CreditCard,
  History,
  BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { centralinoHistoryFilters, centralinoHistoryHref } from "@/lib/centralinoNavigation";
import { AgentiTab } from "@/components/agenti/AgentiTab";
import { AgentiAIStatsBar } from "@/components/agenti/AgentiAIStatsBar";
import { TelephonyTab } from "@/components/agenti/TelephonyTab";
import { ConversazioniTab } from "@/components/agenti/ConversazioniTab";
import { KnowledgeBaseTab } from "@/components/agenti/KnowledgeBaseTab";
// MP-CLEANUP: WhatsAppMultiNumeroTab rimosso da qui — vive ora solo
// nell'Hub dedicato /azienda/whatsapp (sidebar link).
import { ChatConversazioniTab } from "@/components/agenti/ChatConversazioniTab";
import { CampagneTab } from "@/components/agenti/CampagneTab";
import { CreditiTab } from "@/components/agenti/CreditiTab";
import { StatisticheTab } from "@/components/agenti/StatisticheTab";
import { useAICompanyStats } from "@/hooks/useUnifiedAgents";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useIsMobile } from "@/hooks/use-mobile";

type MainTab = "agenti" | "knowledge" | "telefonia" | "conversazioni" | "chat" | "campagne" | "statistiche" | "crediti";

// MP-CLEANUP: tab "whatsapp" rimossa da AgentiAIPage.
// L'hub WhatsApp è unico su /azienda/whatsapp (link sidebar "WhatsApp").
//
// Alcune tab sono rilevanti solo nel contesto azienda (tracking budget
// cliente), non per il SuperAdmin che è lui stesso il pagatore della
// piattaforma. Vengono filtrate quando siamo in /admin/marketing/agenti-ai.
// labelBreve: sotto 1280, dove le otto schede devono stare in una riga.
const ALL_TABS: { key: MainTab; label: string; labelBreve?: string; icon: typeof Bot; hiddenInAdmin?: boolean }[] = [
  { key: "agenti", label: "Agenti", icon: Bot },
  { key: "knowledge", label: "Knowledge Base", icon: BookOpen },
  { key: "telefonia", label: "Telefonia", icon: Phone },
  { key: "conversazioni", label: "Chiamate", icon: History },
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "campagne", label: "Campagne", icon: Megaphone },
  { key: "statistiche", label: "Statistiche", icon: BarChart2 },
  // Crediti & Utilizzo: il SuperAdmin paga l'intera piattaforma, non ha
  // senso mostrargli un tracker di crediti/ricariche come se fosse un
  // cliente. Per lui la voce è gestita altrove (billing piattaforma).
  { key: "crediti", label: "Crediti & Utilizzo", labelBreve: "Crediti", icon: CreditCard, hiddenInAdmin: true },
];

// Telefono: gli agenti si guardano (elenco, chiamate, chat); knowledge base,
// telefonia, campagne, statistiche e crediti si impostano da computer o tablet.
const TAB_TELEFONO: MainTab[] = ["agenti", "conversazioni", "chat"];

export default function AgentiAIPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname } = useLocation();
  const navigate=useNavigate();
  const closeAssistance=()=>setSearchParams(previous=>{const next=new URLSearchParams(previous);next.delete("crea");return next;},{replace:true});
  const isAdminContext = pathname.startsWith("/admin");
  // Filtra le tab non pertinenti al SuperAdmin (oggi solo "Crediti & Utilizzo").
  const TABS = useMemo(
    () => ALL_TABS.filter((t) => !(isAdminContext && t.hiddenInAdmin) && (isAdminContext || t.key !== "conversazioni")),
    [isAdminContext],
  );
  const rawTab = searchParams.get("tab") as MainTab | null;
  // Se l'admin atterra su una tab nascosta (es. deeplink), fallback ad "agenti".
  const isMobile = useIsMobile();
  const activeTab: MainTab =
    rawTab && TABS.some((t) => t.key === rawTab) && !(isMobile && !TAB_TELEFONO.includes(rawTab)) ? rawTab : "agenti";
  const companyId = useEffectiveCompanyId();
  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: retryStats } = useAICompanyStats();

  // ElevenLabs config status — read-only via safe view
  const { data: elConfig } = useQuery({
    queryKey: ["el-config-safe", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_elevenlabs_config_safe" as never)
        .select("api_key_valida, crediti_rimanenti, piano")
        .eq("company_id", companyId!)
        .maybeSingle();
      return data as { api_key_valida: boolean; crediti_rimanenti: number; piano: string } | null;
    },
  });

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  if (!isAdminContext && (rawTab === "conversazioni" || searchParams.get("tab") === "chiamate")) {
    return <Navigate to={centralinoHistoryHref(centralinoHistoryFilters(searchParams).agentId)} replace />;
  }

  return (
    <div className="eic-workspace space-y-4">
      {searchParams.get("crea")==="assistenza" && <FishOnboardingWizard open initialFlowId="support_appointment" onClose={closeAssistance} onSuccess={id=>navigate(`/azienda/agenti-ai/${id}`)}/>}
      <header className="eic-workspace-header eic-motion-enter flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="eic-workspace-icon"><Bot aria-hidden="true" className="size-5" /></span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Agenti AI</h1>
            <p className="text-xs text-muted-foreground md:hidden">Configurazione da computer o tablet</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isAdminContext && (
            <Button asChild variant="outline" size="sm" className="eic-motion-button">
              <Link to={centralinoHistoryHref()}><History aria-hidden="true" className="mr-1.5 size-4" /> Chiamate nel Centralino</Link>
            </Button>
          )}
          {elConfig?.api_key_valida && (
            <div className="hidden items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs md:flex">
              <span className="size-2 rounded-full bg-orange-500" aria-hidden="true" />
              ElevenLabs connesso
              {elConfig.crediti_rimanenti != null && (
                <span className="text-muted-foreground">· {Math.round(elConfig.crediti_rimanenti).toLocaleString("it-IT")} crediti</span>
              )}
            </div>
          )}
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="min-w-0 overflow-x-auto px-1 pb-3 pt-1">
          <WorkspaceTabs label="Sezioni di Agenti AI" selected={activeTab} compactIcons className="max-md:w-full"
            items={TABS.filter(({ key }) => !isMobile || TAB_TELEFONO.includes(key))
              .map(({ key, label, labelBreve, icon }) => ({ id: key, label, shortLabel: labelBreve, icon }))} />
        </div>

        {/* Stats bar — only on Agenti tab */}
        {activeTab === "agenti" && (
          statsError ? <div role="alert" className="mb-3 rounded-lg border border-amber-200 p-3 text-sm">
            Statistiche non caricate. <button className="underline" onClick={() => retryStats()}>Riprova</button>
          </div> : stats
            ? <AgentiAIStatsBar stats={stats} />
            : statsLoading
              ? (
                <div className="grid grid-cols-2 gap-2.5 pb-4 sm:grid-cols-3 lg:grid-cols-6 md:gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="h-9 w-9 flex-shrink-0 animate-pulse rounded-lg bg-slate-100" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-5 w-10 animate-pulse rounded bg-slate-100" />
                        <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
                      </div>
                    </div>
                  ))}
                </div>
              )
              : null
        )}

        {/* Tab content */}
        <TabsContent value="agenti" className="mt-0">
          <AgentiTab />
        </TabsContent>

        {/* Contenuti delle schede senza p-6 da 768 (margine doppio col layout). */}
        <TabsContent value="knowledge" className="mt-0 pt-1">
          <KnowledgeBaseTab />
        </TabsContent>

        <TabsContent value="telefonia" className="mt-0 pt-1">
          <TelephonyTab />
        </TabsContent>

        {isAdminContext && <TabsContent value="conversazioni" className="mt-0 pt-1 max-md:py-3">
          <ConversazioniTab />
        </TabsContent>}

        <TabsContent value="chat" className="mt-0 pt-1 max-md:py-3">
          <ChatConversazioniTab />
        </TabsContent>

        <TabsContent value="campagne" className="mt-0 pt-1">
          <CampagneTab />
        </TabsContent>

        {/* MP-CLEANUP: rimossa tab whatsapp. Hub unico in /azienda/whatsapp. */}

        <TabsContent value="statistiche" className="mt-0 pt-1">
          <StatisticheTab />
        </TabsContent>

        <TabsContent value="crediti" className="mt-0 pt-1">
          <CreditiTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
