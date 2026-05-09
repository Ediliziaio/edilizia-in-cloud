/**
 * AIMonitorPage — Monitoring AI (sostituisce vecchia /admin/ai-usage + /admin/ai-test-lab)
 *
 * 3 tab: Usage (costi/ricavi/margini) · TestLab (confronto modelli) · Health
 *
 * Refactor Strategia C — consolida tutta l'osservabilità AI in un'unica pagina.
 * Le vecchie route fanno redirect qui con tab pre-selezionata.
 */
import { lazy, Suspense, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, FlaskConical, Activity } from "lucide-react";

const AIUsageMonitor = lazy(() =>
  import("@/components/admin/settings/AIUsageMonitor").then((m) => ({ default: m.AIUsageMonitor })),
);
const AdminAITestLab = lazy(() => import("@/pages/admin/AdminAITestLab"));
const AIHealthDashboard = lazy(() =>
  import("@/components/admin/ai-monitor/AIHealthDashboard").then((m) => ({ default: m.AIHealthDashboard })),
);

const fallback = (
  <div className="space-y-3 p-6">
    <Skeleton className="h-8 w-1/3" />
    <Skeleton className="h-32 w-full" />
    <Skeleton className="h-64 w-full" />
  </div>
);

export default function AIMonitorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "usage";
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
        <Activity className="h-8 w-8 text-orange-500" />
        <div>
          <h1 className="text-2xl font-bold">AI · Monitor</h1>
          <p className="text-sm text-muted-foreground">
            Costi, ricavi, margini, qualità modelli e health del sistema AI
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="usage" className="gap-2">
            <LineChart className="h-4 w-4" />
            Usage & Costs
          </TabsTrigger>
          <TabsTrigger value="test-lab" className="gap-2">
            <FlaskConical className="h-4 w-4" />
            Test Lab
          </TabsTrigger>
          <TabsTrigger value="health" className="gap-2">
            <Activity className="h-4 w-4" />
            Health
          </TabsTrigger>
        </TabsList>

        <TabsContent value="usage">
          <Suspense fallback={fallback}>
            <AIUsageMonitor />
          </Suspense>
        </TabsContent>

        <TabsContent value="test-lab">
          <Suspense fallback={fallback}>
            <AdminAITestLab />
          </Suspense>
        </TabsContent>

        <TabsContent value="health">
          <Suspense fallback={fallback}>
            <AIHealthDashboard />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
