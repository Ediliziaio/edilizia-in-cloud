import { useSearchParams, useLocation } from "react-router-dom";
import { useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Badge } from "@/components/ui/badge";
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

type MainTab = "agenti" | "knowledge" | "telefonia" | "conversazioni" | "chat" | "campagne" | "statistiche" | "crediti";

// MP-CLEANUP: tab "whatsapp" rimossa da AgentiAIPage.
// L'hub WhatsApp è unico su /azienda/whatsapp (link sidebar "WhatsApp").
//
// Alcune tab sono rilevanti solo nel contesto azienda (tracking budget
// cliente), non per il SuperAdmin che è lui stesso il pagatore della
// piattaforma. Vengono filtrate quando siamo in /admin/marketing/agenti-ai.
const ALL_TABS: { key: MainTab; label: string; icon: typeof Bot; badge?: string; hiddenInAdmin?: boolean }[] = [
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
  { key: "crediti", label: "Crediti & Utilizzo", icon: CreditCard, hiddenInAdmin: true },
];

export default function AgentiAIPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname } = useLocation();
  const isAdminContext = pathname.startsWith("/admin");
  // Filtra le tab non pertinenti al SuperAdmin (oggi solo "Crediti & Utilizzo").
  const TABS = useMemo(
    () => ALL_TABS.filter((t) => !(isAdminContext && t.hiddenInAdmin)),
    [isAdminContext],
  );
  const rawTab = searchParams.get("tab") as MainTab | null;
  // Se l'admin atterra su una tab nascosta (es. deeplink), fallback ad "agenti".
  const activeTab: MainTab = rawTab && TABS.some((t) => t.key === rawTab) ? rawTab : "agenti";
  const companyId = useEffectiveCompanyId();
  const { data: stats, isLoading: statsLoading } = useAICompanyStats();

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

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/50 p-5 shadow-sm">
          <div className="mb-1 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-200">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-950">Agenti AI</h1>
                <p className="mt-1 text-sm text-slate-600">
                  Gestisci agenti vocali, chat, campagne e knowledge base. WhatsApp vive nel suo hub dedicato.
                </p>
              </div>
            </div>

            {/* ElevenLabs status badge (read-only) */}
            {elConfig?.api_key_valida && (
              <div className="flex items-center gap-1.5 rounded-lg border border-orange-100 bg-white/80 px-3 py-1.5 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="text-xs font-medium text-slate-800">ElevenLabs connesso</span>
                {elConfig.crediti_rimanenti != null && (
                  <span className="ml-1 text-xs text-slate-500">
                    · {Math.round(elConfig.crediti_rimanenti).toLocaleString("it-IT")} crediti
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="px-6 pb-3">
          <TabsList className="h-auto gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="rounded-xl px-4 py-2.5 text-sm data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 data-[state=active]:shadow-sm"
                >
                  <Icon className="h-4 w-4 mr-1.5" />
                  {tab.label}
                  {tab.badge && (
                    <Badge variant="secondary" className="ml-1.5 text-[9px] px-1 py-0">
                      {tab.badge}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Stats bar — only on Agenti tab */}
        {activeTab === "agenti" && (
          stats
            ? <AgentiAIStatsBar stats={stats} />
            : statsLoading
              ? (
                <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 px-6 py-4 bg-card border-b border-border">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-muted animate-pulse flex-shrink-0" />
                      <div className="space-y-1.5 flex-1">
                        <div className="h-5 w-10 bg-muted animate-pulse rounded" />
                        <div className="h-3 w-16 bg-muted animate-pulse rounded" />
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

        <TabsContent value="knowledge" className="mt-0 p-6">
          <KnowledgeBaseTab />
        </TabsContent>

        <TabsContent value="telefonia" className="mt-0 p-6">
          <TelephonyTab />
        </TabsContent>

        <TabsContent value="conversazioni" className="mt-0 p-6">
          <ConversazioniTab />
        </TabsContent>

        <TabsContent value="chat" className="mt-0 p-6">
          <ChatConversazioniTab />
        </TabsContent>

        <TabsContent value="campagne" className="mt-0 p-6">
          <CampagneTab />
        </TabsContent>

        {/* MP-CLEANUP: rimossa tab whatsapp. Hub unico in /azienda/whatsapp. */}

        <TabsContent value="statistiche" className="mt-0 p-6">
          <StatisticheTab />
        </TabsContent>

        <TabsContent value="crediti" className="mt-0 p-6">
          <CreditiTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
