/**
 * AdminAIHub — pagina hub per tutta l'area AI Superadmin
 *
 * Consolida 4 voci sidebar separate (AI Config, AI Monitor, AI Operate,
 * AI Memoria) in un'unica pagina con 4 tab in alto.
 *
 * Ogni pagina è già un mini-hub internamente (AI Operate ha 8 sub-tab,
 * AI Config 6, AI Monitor 4). Il livello superiore qui è quindi una
 * navigazione a 2 click: tab esterno = area funzionale, tab interno = vista
 * specifica. Stesso pattern di Linear o GitHub.
 *
 * Tab state via ?tab=ai-* — le route legacy (/admin/ai-config, ecc.)
 * restano attive come redirect.
 */
import { lazy, Suspense, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Settings2,
  BarChart3,
  Bot,
  Brain,
  Sparkles,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeroHeader } from "@/components/admin/AdminHeroHeader";
import { AdminHubTabs, type AdminHubTab } from "@/components/admin/AdminHubTabs";
import { AIHubNestedProvider } from "@/components/admin/ai-shared/AIHubNestedContext";

const AIConfigPage = lazy(() => import("@/pages/admin/ai/AIConfigPage"));
const AIMonitorPage = lazy(() => import("@/pages/admin/ai/AIMonitorPage"));
const AIOperatePage = lazy(() => import("@/pages/admin/ai/AIOperatePage"));
const AdminAIMemoryPage = lazy(() => import("@/pages/admin/ai/AdminAIMemoryPage"));

type AITab = "operate" | "monitor" | "config" | "memoria";

const VALID_TABS: readonly AITab[] = ["operate", "monitor", "config", "memoria"];

function isValidTab(value: string | null): value is AITab {
  return value != null && (VALID_TABS as readonly string[]).includes(value);
}

export default function AdminAIHub() {
  const [searchParams, setSearchParams] = useSearchParams();

  const sectionParam = searchParams.get("section");
  const requestedTab: AITab = isValidTab(sectionParam) ? sectionParam : "operate";

  // ── Tabs in ordine di frequenza d'uso quotidiana:
  // Operate (azioni day-by-day) → Monitor (live ops) → Config (setup) →
  // Memoria (cross-company analytics). ───────────────────────────────────
  const tabs = [
    {
      id: "operate" as const,
      label: "Operate",
      icon: Bot,
      description: "Approvals, queue, agents, chief, personas, memory, learning",
    },
    {
      id: "monitor" as const,
      label: "Monitor",
      icon: BarChart3,
      description: "Usage, costi, test lab, health AI",
    },
    {
      id: "config" as const,
      label: "Config",
      icon: Settings2,
      description: "Routing modelli, personas cliente, KB, pricing, governance",
    },
    {
      id: "memoria" as const,
      label: "Memoria Clienti",
      icon: Brain,
      description: "Memoria delle 18 AI personas CLIENTI, vista cross-company (≠ memoria Personas Admin in Operate)",
    },
  ];

  const activeTab: AITab = tabs.some((t) => t.id === requestedTab)
    ? requestedTab
    : "operate";

  const handleTabChange = useCallback(
    (tab: AITab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          // `tab` resta riservato per le sub-tab interne di AIOperate/Config/Monitor.
          // Usiamo `section` come parametro top-level per evitare collisioni.
          if (tab === "operate") next.delete("section");
          else next.set("section", tab);
          // Quando cambi area, resetta la sub-tab (altrimenti porta uno stato
          // incoerente alla pagina figlia che si aspetta `tab` valido per sé).
          next.delete("tab");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return (
    <div className="space-y-4 pb-20 sm:space-y-6 sm:pb-0">
      {/* ─── Hero header in stile Commesse ──────────────────────────────── */}
      <AdminHeroHeader
        icon={Sparkles}
        title="Intelligenza Artificiale"
        subtitle="Operate, monitor, config e memoria AI in un'unica vista."
      />

      {/* ─── Tab navigation ─────────────────────────────────────────────── */}
      <AdminHubTabs<AITab>
        activeTab={activeTab}
        onChange={handleTabChange}
        ariaLabel="Sezioni AI"
        tabs={tabs as AdminHubTab<AITab>[]}
      />

      {/* ─── Tab content ────────────────────────────────────────────────── */}
      {/* AIHubNestedProvider segnala alle sub-pagine che sono dentro hub:
          - nascondono il proprio AIPageHeader (triplo header fix)
          - quickLink "Configurazione/Monitor/Operate" usano section invece
            di navigation legacy (no più redirect roundtrip) */}
      <AIHubNestedProvider navigateToSection={handleTabChange}>
        <Suspense fallback={<HubTabSkeleton />}>
          {activeTab === "operate" && <AIOperatePage />}
          {activeTab === "monitor" && <AIMonitorPage />}
          {activeTab === "config" && <AIConfigPage />}
          {activeTab === "memoria" && <AdminAIMemoryPage />}
        </Suspense>
      </AIHubNestedProvider>
    </div>
  );
}

function HubTabSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
