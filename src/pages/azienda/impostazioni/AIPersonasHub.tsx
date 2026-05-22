/**
 * AIPersonasHub — v8.6.73 (rev. 2026-05-22)
 *
 * Hub unificato per le 18 AI Personas — fonde 4 viste in una pagina sola:
 *   1. 💬 Chat        — interfaccia conversazionale (era /azienda/assistente-ai)
 *   2. 🧠 Memoria     — fatti/preferenze/decisioni che le AI ricordano (era /impostazioni/ai-memoria)
 *   3. 🕸️ Cervello    — knowledge graph interattivo 3D (reagraph WebGL)
 *   4. 📜 Sessioni    — storico conversazioni (placeholder, futuro)
 *
 * Razionale UX:
 * Prima erano 2 pagine separate ("Assistente AI" vs "Memoria AI Personas") con
 * forte sovrapposizione concettuale. Le conversazioni alimentano la memoria
 * (auto-popolazione via feedback loop ai-orchestrator) → ha senso che vivano
 * nello stesso posto. L'utente apre la pagina, parla con la persona, vede e
 * cura le memorie che ne derivano senza cambiare rotta.
 *
 * Le route legacy sono mantenute:
 *   - /azienda/assistente-ai             → redirect a ?tab=chat
 *   - /azienda/impostazioni/ai-memoria  → questa pagina (tab default "memoria")
 *
 * Il tab attivo è persisted in URL via ?tab=... per condivisione link + history.
 */
import { useSearchParams } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, MessageSquare, History, Network } from "lucide-react";

const AssistenteAIPage = lazy(() => import("@/pages/azienda/AssistenteAIPage"));
const AIMemoryPage = lazy(() => import("@/pages/azienda/AIMemoryPage"));
const AIPersonasSessionsTab = lazy(() => import("./AIPersonasSessionsTab"));
const AIBrainGraph = lazy(() => import("@/components/ai/AIBrainGraph"));

const VALID_TABS = ["chat", "memoria", "cervello", "sessioni"] as const;
type TabKey = (typeof VALID_TABS)[number];

function isValidTab(v: string | null): v is TabKey {
  return v != null && (VALID_TABS as readonly string[]).includes(v);
}

export default function AIPersonasHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TabKey = isValidTab(tabParam) ? tabParam : "chat";

  const handleTabChange = (next: string) => {
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", next);
    setSearchParams(sp, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid grid-cols-4 max-w-2xl">
          <TabsTrigger value="chat" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="memoria" className="gap-2">
            <Brain className="h-4 w-4" />
            Memoria
          </TabsTrigger>
          <TabsTrigger value="cervello" className="gap-2">
            <Network className="h-4 w-4" />
            Cervello
          </TabsTrigger>
          <TabsTrigger value="sessioni" className="gap-2">
            <History className="h-4 w-4" />
            Sessioni
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="mt-4">
          <Suspense fallback={<TabSkeleton />}>
            <AssistenteAIPage embedded />
          </Suspense>
        </TabsContent>

        <TabsContent value="memoria" className="mt-4">
          <Suspense fallback={<TabSkeleton />}>
            <AIMemoryPage embedded />
          </Suspense>
        </TabsContent>

        <TabsContent value="cervello" className="mt-4">
          <Suspense fallback={<TabSkeleton />}>
            <AIBrainGraph />
          </Suspense>
        </TabsContent>

        <TabsContent value="sessioni" className="mt-4">
          <Suspense fallback={<TabSkeleton />}>
            <AIPersonasSessionsTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
