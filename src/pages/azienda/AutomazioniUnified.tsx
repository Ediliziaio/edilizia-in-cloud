import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Workflow, GitBranch, Sparkles, Plus, LayoutTemplate } from "lucide-react";
import { AutomazioniHeader } from "@/components/automazioni/AutomazioniHeader";
import { AutomazioniList } from "@/components/automazioni/AutomazioniList";
import { AutomazioniTemplateGallery } from "@/components/automazioni/AutomazioniTemplateGallery";
import { AutomazioneFormDrawer } from "@/components/automazioni/AutomazioneFormDrawer";
import type { AutomationRule } from "@/hooks/useAutomazioni";

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
  { value: "marketing", label: "Marketing", icon: GitBranch },
  { value: "regole", label: "Regole", icon: Sparkles },
] as const;

type CategoriaFiltro = "tutte" | "task" | "marketing" | "crm" | "cantieri" | "notifiche" | "generale";

const CATEGORIE: { value: CategoriaFiltro; label: string; emoji: string }[] = [
  { value: "tutte", label: "Tutte", emoji: "⚡" },
  { value: "task", label: "Task", emoji: "✅" },
  { value: "marketing", label: "Marketing", emoji: "📢" },
  { value: "crm", label: "CRM", emoji: "💼" },
  { value: "cantieri", label: "Cantieri", emoji: "🏗️" },
  { value: "notifiche", label: "Notifiche", emoji: "🔔" },
  { value: "generale", label: "Generali", emoji: "🔧" },
];

export default function AutomazioniUnified() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "operative";

  // Regole tab state
  const [categoria, setCategoria] = useState<CategoriaFiltro>("tutte");
  const [viewMode, setViewMode] = useState<"attive" | "template">("attive");
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [showForm, setShowForm] = useState(false);

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automazioni</h1>
          <p className="text-muted-foreground text-sm">
            Gestisci tutte le automazioni operative, task e marketing in un unico posto.
          </p>
        </div>
        {activeTab === "regole" && <AutomazioniHeader />}
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

        <TabsContent value="marketing">
          <Suspense fallback={<Fallback />}>
            <MarketingAutomations />
          </Suspense>
        </TabsContent>

        <TabsContent value="regole">
          {/* Category filter bar + actions */}
          <div className="flex items-center justify-between py-3">
            <div className="flex gap-1 overflow-x-auto">
              {CATEGORIE.map(cat => (
                <button
                  key={cat.value}
                  onClick={() => setCategoria(cat.value)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                    whitespace-nowrap transition-all
                    ${categoria === cat.value
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted"
                    }
                  `}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => setViewMode(viewMode === "attive" ? "template" : "attive")}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors
                  ${viewMode === "template"
                    ? "border-primary text-primary bg-primary/10"
                    : "border-border text-muted-foreground hover:bg-muted"
                  }
                `}
              >
                <LayoutTemplate className="w-4 h-4" />
                Template
              </button>
              <Button onClick={() => { setEditingRule(null); setShowForm(true); }}>
                <Plus className="w-4 h-4 mr-1.5" />
                Nuova automazione
              </Button>
            </div>
          </div>

          {/* Content — show Task automations when filtered by "task" */}
          {categoria === "task" && viewMode === "attive" ? (
            <Suspense fallback={<Fallback />}>
              <TaskAutomationsPage />
            </Suspense>
          ) : viewMode === "attive" ? (
            <AutomazioniList
              categoria={categoria}
              onEdit={rule => { setEditingRule(rule); setShowForm(true); }}
            />
          ) : (
            <AutomazioniTemplateGallery
              categoria={categoria}
              onCustomizza={template => { setEditingRule(template); setShowForm(true); }}
            />
          )}

          {/* Form drawer */}
          {showForm && (
            <AutomazioneFormDrawer
              rule={editingRule}
              onClose={() => { setShowForm(false); setEditingRule(null); }}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
