import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Bot,
  BookOpen,
  Phone,
  Megaphone,
  MessageSquare,
  CreditCard,
  Settings,
  AlertTriangle,
  History,
  BarChart2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AgentiTab } from "@/components/agenti/AgentiTab";
import { AgentiAIStatsBar } from "@/components/agenti/AgentiAIStatsBar";
import { TelephonyTab } from "@/components/agenti/TelephonyTab";
import { ConversazioniTab } from "@/components/agenti/ConversazioniTab";
import { KnowledgeBaseTab } from "@/components/agenti/KnowledgeBaseTab";
import { WhatsAppTabUnified } from "@/components/agenti/WhatsAppTabUnified";
import { ChatConversazioniTab } from "@/components/agenti/ChatConversazioniTab";
import { CampagneTab } from "@/components/agenti/CampagneTab";
import { CreditiTab } from "@/components/agenti/CreditiTab";
import { StatisticheTab } from "@/components/agenti/StatisticheTab";
import { ImpostazioniTab } from "@/components/agenti/ImpostazioniTab";
import { useAICompanyStats } from "@/hooks/useUnifiedAgents";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";

type MainTab = "agenti" | "knowledge" | "telefonia" | "conversazioni" | "chat" | "campagne" | "whatsapp" | "statistiche" | "crediti" | "impostazioni";

const TABS: { key: MainTab; label: string; icon: typeof Bot; badge?: string }[] = [
  { key: "agenti", label: "Agenti", icon: Bot },
  { key: "knowledge", label: "Knowledge Base", icon: BookOpen },
  { key: "telefonia", label: "Telefonia", icon: Phone },
  { key: "conversazioni", label: "Chiamate", icon: History },
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "campagne", label: "Campagne", icon: Megaphone },
  { key: "whatsapp", label: "WhatsApp", icon: MessageSquare, badge: "Alpha" },
  { key: "statistiche", label: "Statistiche", icon: BarChart2 },
  { key: "crediti", label: "Crediti & Utilizzo", icon: CreditCard },
  { key: "impostazioni", label: "Impostazioni", icon: Settings },
];

export default function AgentiAIPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as MainTab) || "agenti";
  const { role } = useAuth();
  const companyId = useEffectiveCompanyId();
  const { data: stats } = useAICompanyStats();

  // ElevenLabs config status
  const { data: elConfig } = useQuery({
    queryKey: ["el-config", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_elevenlabs_config" as never)
        .select("api_key_valida, crediti_rimanenti, piano")
        .eq("company_id", companyId!)
        .single();
      return data as { api_key_valida: boolean; crediti_rimanenti: number; piano: string } | null;
    },
  });

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  // Filter tabs — hide Impostazioni for non-super_admin
  const visibleTabs = TABS.filter((tab) => {
    if (tab.key === "impostazioni" && role !== "super_admin") return false;
    return true;
  });

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

          {/* ElevenLabs status badge */}
          {elConfig?.api_key_valida ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-accent/50 border-accent">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <span className="text-xs font-medium text-foreground">ElevenLabs connesso</span>
              {elConfig.crediti_rimanenti != null && (
                <span className="text-xs text-muted-foreground ml-1">
                  · {Math.round(elConfig.crediti_rimanenti).toLocaleString("it-IT")} crediti
                </span>
              )}
            </div>
          ) : (
            <button
              onClick={() => handleTabChange("impostazioni")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 transition-colors"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs font-medium text-destructive">Configura ElevenLabs</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="px-6 border-b border-border">
          <TabsList className="bg-transparent h-auto p-0 gap-0">
            {visibleTabs.map((tab) => {
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
        {activeTab === "agenti" && stats && <AgentiAIStatsBar stats={stats} />}

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

        <TabsContent value="whatsapp" className="mt-0 p-6">
          <WhatsAppTabUnified />
        </TabsContent>

        <TabsContent value="statistiche" className="mt-0 p-6">
          <StatisticheTab />
        </TabsContent>

        <TabsContent value="crediti" className="mt-0 p-6">
          <CreditiTab />
        </TabsContent>

        <TabsContent value="impostazioni" className="mt-0 p-6">
          <ImpostazioniTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
