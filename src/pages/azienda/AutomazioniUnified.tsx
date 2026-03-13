import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { Workflow, ListTodo, GitBranch } from "lucide-react";

const InternalAutomations = lazy(() => import("@/pages/azienda/InternalAutomations"));
const TaskAutomationsPage = lazy(() => import("@/pages/azienda/TaskAutomationsPage"));
const MarketingAutomations = lazy(() => import("@/pages/azienda/marketing/MarketingAutomations"));

const Fallback = () => (
  <div className="flex items-center justify-center h-full min-h-[200px]">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const TABS = [
  { value: "operative", label: "Operative", icon: Workflow },
  { value: "task", label: "Task", icon: ListTodo },
  { value: "marketing", label: "Marketing", icon: GitBranch },
] as const;

export default function AutomazioniUnified() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "operative";

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Automazioni</h1>
        <p className="text-muted-foreground text-sm">
          Gestisci tutte le automazioni operative, task e marketing in un unico posto.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-1.5">
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="operative">
          <Suspense fallback={<Fallback />}>
            <InternalAutomations />
          </Suspense>
        </TabsContent>

        <TabsContent value="task">
          <Suspense fallback={<Fallback />}>
            <TaskAutomationsPage />
          </Suspense>
        </TabsContent>

        <TabsContent value="marketing">
          <Suspense fallback={<Fallback />}>
            <MarketingAutomations />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
