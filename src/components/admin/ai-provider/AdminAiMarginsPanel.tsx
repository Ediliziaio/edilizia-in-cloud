// MP05-FIX — SuperAdmin panel con 4 sub-tab:
//   Overview  — KPI margini + breakdown per task
//   Markup    — editor listino markup per task_kind
//   Modelli   — config primary/fallback per task (company_id=NULL)
//   Aziende   — breakdown spesa/margine per azienda

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminAiMarginsOverview } from "./AdminAiMarginsOverview";
import { AdminMarkupConfigTab } from "./AdminMarkupConfigTab";
import { AdminModelConfigTab } from "./AdminModelConfigTab";
import { AdminAiPerCompanyTable } from "./AdminAiPerCompanyTable";
import { AdminAiSpesaRealeCard } from "./AdminAiSpesaRealeCard";
import { Zap } from "lucide-react";

export function AdminAiMarginsPanel() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          AI Provider &amp; Margini
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Gestione modelli, markup per-task e monitoraggio costi reali vs ricavi.
          Le aziende non vedono queste configurazioni.
        </p>
      </div>

      {/* Prima di tutto il resto: la spesa vera, letta dal registro addebiti.
          I sub-tab qui sotto passano ancora da get_ai_economics_dashboard, che
          legge ai_model_usage_log (7 righe contro le 1073 del ledger). */}
      <AdminAiSpesaRealeCard />

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview Margini</TabsTrigger>
          <TabsTrigger value="markup">Listino Markup</TabsTrigger>
          <TabsTrigger value="models">Modelli per Task</TabsTrigger>
          <TabsTrigger value="companies">Per Azienda</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <AdminAiMarginsOverview />
        </TabsContent>
        <TabsContent value="markup" className="mt-4">
          <AdminMarkupConfigTab />
        </TabsContent>
        <TabsContent value="models" className="mt-4">
          <AdminModelConfigTab />
        </TabsContent>
        <TabsContent value="companies" className="mt-4">
          <AdminAiPerCompanyTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
