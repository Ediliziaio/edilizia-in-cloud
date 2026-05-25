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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Coins,
  FlaskConical,
  HeartPulse,
  Settings,
  Bot,
} from "lucide-react";
import { AIPageHeader } from "@/components/admin/ai-shared/AIPageHeader";
import { AITabsList } from "@/components/admin/ai-shared/AITabsList";
import { SectionAlert } from "@/components/admin/ai-shared/SectionIntro";
import { useAIHubNested } from "@/components/admin/ai-shared/AIHubNestedContext";

const AIUsageMonitor = lazy(() =>
  import("@/components/admin/settings/AIUsageMonitor").then((m) => ({ default: m.AIUsageMonitor })),
);
const AdminAITestLab = lazy(() => import("@/pages/admin/AdminAITestLab"));
const AIHealthDashboard = lazy(() =>
  import("@/components/admin/ai-monitor/AIHealthDashboard").then((m) => ({ default: m.AIHealthDashboard })),
);

const fallback = (
  <div className="space-y-3 py-4">
    <Skeleton className="h-10 w-1/3" />
    <Skeleton className="h-32 w-full" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const TABS = [
  { value: "usage", label: "Usage & Costi", icon: Coins },
  { value: "test-lab", label: "Test Lab", icon: FlaskConical },
  { value: "health", label: "Health", icon: HeartPulse },
];

export default function AIMonitorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "usage";
  const [activeTab, setActiveTab] = useState(initialTab);
  const { isNested, navigateToSection } = useAIHubNested();

  // Sync ?tab= param ↔ state per redirect dalla vecchia route
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && t !== activeTab) setActiveTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (v: string) => {
    setActiveTab(v);
    const params = new URLSearchParams(searchParams);
    params.set("tab", v);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className={isNested ? "" : "p-4 md:p-6 max-w-screen-2xl mx-auto"}>
      {!isNested && (
        <AIPageHeader
          icon={Activity}
          title="AI · Monitor"
          subtitle="Monitoring"
          description="Osservabilità completa del sistema AI: dove vanno i soldi, quale modello costa di più, qual è la latenza p95, chi sta producendo output di qualità. Tutto in tempo reale."
          quickLinks={[
            { label: "Configurazione", to: "/admin/ai-config", icon: Settings },
            { label: "Operate (azioni)", to: "/admin/ai-operate", icon: Bot },
          ]}
        />
      )}
      {isNested && navigateToSection && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => navigateToSection("config")}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            <Settings className="h-3 w-3" />
            Config
          </button>
          <button
            type="button"
            onClick={() => navigateToSection("operate")}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            <Bot className="h-3 w-3" />
            Operate
          </button>
        </div>
      )}

      <AITabsList
        value={activeTab}
        onValueChange={handleTabChange}
        tabs={TABS}
        contents={{
          usage: (
            <>
              <SectionAlert.info
                title="Usage & Costi per azienda"
                description="Aggregato costi/ricavi/margini per giorno, mese e azienda. Drill-down per feature (render/chat/voice/doc/automation), provider (OpenAI/Anthropic/...) e modello specifico."
                bullets={[
                  "KPI: costo totale, ricavi, margine %, top spender",
                  "Diagnostic banner: alert su anomalie (RLS rotta, render senza costo)",
                  "Export CSV per analisi offline",
                  "Soglie alert per piano (configurabili)",
                ]}
              />
              <Suspense fallback={fallback}>
                <AIUsageMonitor />
              </Suspense>
            </>
          ),

          "test-lab": (
            <>
              <SectionAlert.warning
                title="AI Test Lab"
                description="Confronto modelli AI per (cost · latency · quality rating). Aggregato da ai_test_runs su 6 feature × N modelli."
                bullets={[
                  "Filtra per periodo (24h/7d/30d/90d) e feature specifica",
                  "Tabella confronto: n° calls · costo medio · p50/p95 latency · ⭐ rating",
                  "Bottone KB Ingest mega-cervello.md",
                  "Rating utenti alimenta self-improvement loop (in AI Operate → Learning)",
                ]}
                related={[
                  { label: "Self-learning loop", to: "/admin/ai-operate?tab=learning" },
                ]}
              />
              <Suspense fallback={fallback}>
                <AdminAITestLab />
              </Suspense>
            </>
          ),

          health: (
            <>
              <SectionAlert.success
                title="Health Dashboard"
                description="Stato del sistema AI a colpo d'occhio. Aggrega 4 view DB: missioni multi-agent, performance per agent, tool health, self-learning runs."
                bullets={[
                  "Missioni: attive, in attesa approval, failed/total ultimi 7gg",
                  "Performance per agent: tasks_total/done/failed/QA blocked",
                  "Tool health: % failure rate, latenza p95",
                  "Learning: ultime 8 run con gold/avoid/promoted",
                ]}
              />
              <Suspense fallback={fallback}>
                <AIHealthDashboard />
              </Suspense>
            </>
          ),
        }}
      />
    </div>
  );
}
