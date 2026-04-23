import { useSearchParams } from "react-router-dom";
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
import { WhatsAppMultiNumeroTab } from "@/components/whatsapp-multi/WhatsAppMultiNumeroTab";
import { ChatConversazioniTab } from "@/components/agenti/ChatConversazioniTab";
import { CampagneTab } from "@/components/agenti/CampagneTab";
import { CreditiTab } from "@/components/agenti/CreditiTab";
import { StatisticheTab } from "@/components/agenti/StatisticheTab";
import { useAICompanyStats } from "@/hooks/useUnifiedAgents";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

type MainTab = "agenti" | "knowledge" | "telefonia" | "conversazioni" | "chat" | "campagne" | "whatsapp" | "statistiche" | "crediti";

const TABS: { key: MainTab; label: string; icon: typeof Bot; badge?: string }[] = [
  { key: "agenti", label: "Agenti", icon: Bot },
  { key: "knowledge", label: "Knowledge Base", icon: BookOpen },
  { key: "telefonia", label: "Telefonia", icon: Phone },
  { key: "conversazioni", label: "Chiamate", icon: History },
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "campagne", label: "Campagne", icon: Megaphone },
  { key: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { key: "statistiche", label: "Statistiche", icon: BarChart2 },
  { key: "crediti", label: "Crediti & Utilizzo", icon: CreditCard },
];

export default function AgentiAIPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") as MainTab | null;
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
        <div className="flex items-start justify-between mb-1">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              Agenti AI
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestisci tutti i tuoi agenti AI — vocali, chat, WhatsApp e interni — in un unico posto.
            </p>
          </div>

          {/* ElevenLabs status badge (read-only) */}
          {elConfig?.api_key_valida && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-accent/50 border-accent">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <span className="text-xs font-medium text-foreground">ElevenLabs connesso</span>
              {elConfig.crediti_rimanenti != null && (
                <span className="text-xs text-muted-foreground ml-1">
                  · {Math.round(elConfig.crediti_rimanenti).toLocaleString("it-IT")} crediti
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="px-6 border-b border-border">
          <TabsList className="bg-transparent h-auto p-0 gap-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm"
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

        <TabsContent value="whatsapp" className="mt-0">
          {/* MP04 Hub Multi-Numero (sostituisce WhatsAppTabUnified legacy) */}
          <WhatsAppMultiNumeroTab />
        </TabsContent>

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
