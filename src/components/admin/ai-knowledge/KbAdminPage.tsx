/**
 * KbAdminPage — Wrapper della Knowledge Base admin con sub-tabs.
 *
 * Sub-tabs:
 *   1. Documenti (componente esistente AdminSettingsAIKnowledge intatto)
 *   2. Q&A Tests — ground truth regression tests
 *   3. Playground — testa la KB con embedding reale
 *   4. Quality Alerts — chunks problematici (scaduti, orfani, troppo corti...)
 *   5. Budget — token + costo re-embed per categoria
 */

import { lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, FlaskConical, PlayCircle, AlertTriangle, Coins, Globe } from "lucide-react";
import { KbQaTestsTab } from "./KbQaTestsTab";
import { KbPlaygroundTab } from "./KbPlaygroundTab";
import { KbQualityTab } from "./KbQualityTab";
import { KbBudgetTab } from "./KbBudgetTab";
import { KbExternalSourcesTab } from "./KbExternalSourcesTab";

const AdminSettingsAIKnowledge = lazy(() => import("@/pages/admin/settings/AdminSettingsAIKnowledge"));

export function KbAdminPage() {
  return (
    <Tabs defaultValue="docs" className="space-y-4">
      <TabsList>
        <TabsTrigger value="docs" className="gap-2">
          <FileText className="h-4 w-4" />
          Documenti
        </TabsTrigger>
        <TabsTrigger value="qa" className="gap-2">
          <FlaskConical className="h-4 w-4" />
          Q&A Tests
        </TabsTrigger>
        <TabsTrigger value="playground" className="gap-2">
          <PlayCircle className="h-4 w-4" />
          Playground
        </TabsTrigger>
        <TabsTrigger value="quality" className="gap-2">
          <AlertTriangle className="h-4 w-4" />
          Qualità
        </TabsTrigger>
        <TabsTrigger value="budget" className="gap-2">
          <Coins className="h-4 w-4" />
          Budget
        </TabsTrigger>
        <TabsTrigger value="external" className="gap-2">
          <Globe className="h-4 w-4" />
          Fonti esterne
        </TabsTrigger>
      </TabsList>

      <TabsContent value="docs">
        <Suspense fallback={<Skeleton className="h-[400px]" />}>
          <AdminSettingsAIKnowledge />
        </Suspense>
      </TabsContent>

      <TabsContent value="qa">
        <KbQaTestsTab />
      </TabsContent>

      <TabsContent value="playground">
        <KbPlaygroundTab />
      </TabsContent>

      <TabsContent value="quality">
        <KbQualityTab />
      </TabsContent>

      <TabsContent value="budget">
        <KbBudgetTab />
      </TabsContent>

      <TabsContent value="external">
        <KbExternalSourcesTab />
      </TabsContent>
    </Tabs>
  );
}
