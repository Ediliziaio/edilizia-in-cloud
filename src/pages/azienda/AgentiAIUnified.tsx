import { lazy, Suspense } from "react";
import { useSearchParams, Routes, Route } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Bot, BrainCircuit } from "lucide-react";

const AIAgentsModule = lazy(() => import("@/modules/ai-agents"));
const InternalAIAgentsModule = lazy(() => import("@/modules/ai-agents-internal"));

const Fallback = () => (
  <div className="flex items-center justify-center h-full min-h-[200px]">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const TABS = [
  { value: "custom", label: "Agenti Esterni", icon: Bot },
  { value: "platform", label: "Agenti Interni", icon: BrainCircuit },
] as const;

export default function AgentiAIUnified() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tipo") || "custom";

  const handleTabChange = (value: string) => {
    setSearchParams({ tipo: value }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agenti AI</h1>
        <p className="text-muted-foreground text-sm">
          Gestisci agenti AI esterni e interni dalla piattaforma.
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

        <TabsContent value="custom">
          <Suspense fallback={<Fallback />}>
            <AIAgentsModule />
          </Suspense>
        </TabsContent>

        <TabsContent value="platform">
          <Suspense fallback={<Fallback />}>
            <InternalAIAgentsModule />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
