/**
 * AIOperatePage — Operatività AI (sostituisce vecchia /admin/silvio-hub)
 *
 * 7 tab: Approvals · Queue · Policies · Missions · Chief · Memory · Learning
 *
 * Refactor Strategia C — consolida tutto ciò che è "operativo" del sistema AI
 * (azioni day-by-day, governance run-time). La vecchia /admin/silvio-hub
 * fa redirect qui.
 *
 * Nota: i 7 sub-component sono stati estratti dal monolite SilvioAdminHub.tsx
 * (3721 righe) in Fase 1 → ora in src/components/admin/silvio-hub/.
 */
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sparkles,
  Inbox,
  ListTodo,
  Settings,
  Network,
  Activity,
  Brain,
  Zap,
  Users,
} from "lucide-react";
import { ApprovalsTab } from "@/components/admin/silvio-hub/ApprovalsTab";
import { QueueTab } from "@/components/admin/silvio-hub/QueueTab";
import { PoliciesTab } from "@/components/admin/silvio-hub/PoliciesTab";
import { AgentsMissionTab } from "@/components/admin/silvio-hub/AgentsMissionTab";
import { ChiefOfStaffTab } from "@/components/admin/silvio-hub/ChiefOfStaffTab";
import { MemoryTab } from "@/components/admin/silvio-hub/MemoryTab";
import { LearningTab } from "@/components/admin/silvio-hub/LearningTab";
import { AdminPersonasTab } from "@/components/admin/silvio-hub/AdminPersonasTab";

export default function AIOperatePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "approvals";
  const [activeTab, setActiveTab] = useState(initialTab);

  // Sync ?tab= param ↔ state per redirect dalla vecchia route
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && t !== activeTab) setActiveTab(t);
  }, [searchParams]);

  const handleTabChange = (v: string) => {
    setActiveTab(v);
    const params = new URLSearchParams(searchParams);
    params.set("tab", v);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-8 w-8 text-orange-500" />
        <div>
          <h1 className="text-2xl font-bold">AI · Operatività</h1>
          <p className="text-sm text-muted-foreground">
            Approvazioni, coda azioni, policy, missioni multi-agent, chief, memoria, self-learning
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="approvals" className="gap-2">
            <Inbox className="h-4 w-4" />
            Approvazioni
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-2">
            <ListTodo className="h-4 w-4" />
            Coda azioni
          </TabsTrigger>
          <TabsTrigger value="policies" className="gap-2">
            <Settings className="h-4 w-4" />
            Policies
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-2">
            <Network className="h-4 w-4" />
            Agenti
          </TabsTrigger>
          <TabsTrigger value="chief" className="gap-2">
            <Activity className="h-4 w-4" />
            Chief
          </TabsTrigger>
          <TabsTrigger value="personas" className="gap-2">
            <Users className="h-4 w-4" />
            Personas Admin
          </TabsTrigger>
          <TabsTrigger value="memory" className="gap-2">
            <Brain className="h-4 w-4" />
            Memoria
          </TabsTrigger>
          <TabsTrigger value="learning" className="gap-2">
            <Zap className="h-4 w-4" />
            Self-learning
          </TabsTrigger>
        </TabsList>

        <TabsContent value="approvals">
          <ApprovalsTab />
        </TabsContent>
        <TabsContent value="queue">
          <QueueTab />
        </TabsContent>
        <TabsContent value="policies">
          <PoliciesTab />
        </TabsContent>
        <TabsContent value="agents">
          <AgentsMissionTab />
        </TabsContent>
        <TabsContent value="chief">
          <ChiefOfStaffTab />
        </TabsContent>
        <TabsContent value="personas">
          <AdminPersonasTab />
        </TabsContent>
        <TabsContent value="memory">
          <MemoryTab />
        </TabsContent>
        <TabsContent value="learning">
          <LearningTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
