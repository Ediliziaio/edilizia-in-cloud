/**
 * SilvioAdminHub — Hub centrale super_admin per governance Silvio:
 * approval, queue, policy, agenti, memoria e self-learning.
 *
 * Refactor: il file monolite (3721 righe) è stato spezzato in 7 sub-component
 * + un file shared per tipi/costanti. Ogni tab è ora maintainable in isolamento.
 *
 * @see src/components/admin/silvio-hub/ per i sub-component.
 */
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
} from "lucide-react";
import { ApprovalsTab } from "@/components/admin/silvio-hub/ApprovalsTab";
import { QueueTab } from "@/components/admin/silvio-hub/QueueTab";
import { PoliciesTab } from "@/components/admin/silvio-hub/PoliciesTab";
import { AgentsMissionTab } from "@/components/admin/silvio-hub/AgentsMissionTab";
import { ChiefOfStaffTab } from "@/components/admin/silvio-hub/ChiefOfStaffTab";
import { MemoryTab } from "@/components/admin/silvio-hub/MemoryTab";
import { LearningTab } from "@/components/admin/silvio-hub/LearningTab";

export default function SilvioAdminHub() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-8 w-8 text-orange-500" />
        <div>
          <h1 className="text-2xl font-bold">Silvio Admin Hub</h1>
          <p className="text-sm text-muted-foreground">
            Approvazioni, coda azioni outbound, policy automation
          </p>
        </div>
      </div>

      <Tabs defaultValue="approvals" className="space-y-4">
        {/* Scroll-x su mobile (8+ tab), wrap su sm+ */}
        <TabsList className="h-auto justify-start overflow-x-auto sm:flex-wrap whitespace-nowrap [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1">
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
          <TabsTrigger value="memory" className="gap-2">
            <Brain className="h-4 w-4" />
            Memoria personas
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
