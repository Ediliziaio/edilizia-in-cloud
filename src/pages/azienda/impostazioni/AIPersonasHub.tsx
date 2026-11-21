/**
 * AIPersonasHub — v8.6.73 (rev. 2026-05-22)
 *
 * Hub degli assistenti AI:
 *   1. 💬 Chat        — interfaccia conversazionale (era /azienda/assistente-ai)
 *   2. 🧠 Memoria     — fatti/preferenze/decisioni che le AI ricordano (era /impostazioni/ai-memoria)
 *   3. 🕸️ Cervello    — knowledge graph interattivo 3D (reagraph WebGL)
 *   4. 📜 Sessioni    — storico conversazioni (placeholder, futuro)
 *   5. Attività    — passaggi effettivi delle elaborazioni supportate
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
import { lazy, Suspense, useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Brain, MessageSquare, History, Network } from "lucide-react";
import { useAttivitaAi } from "@/hooks/useAttivitaAi";
import { raggruppaAttivita, statoAttivita } from "@/lib/ai/attivita";

const AssistenteAIPage = lazy(() => import("@/pages/azienda/AssistenteAIPage"));
const AIMemoryPage = lazy(() => import("@/pages/azienda/AIMemoryPage"));
const AIPersonasSessionsTab = lazy(() => import("./AIPersonasSessionsTab"));
const AIBrainGraph = lazy(() => import("@/components/ai/AIBrainGraph"));
const AttivitaAiTab = lazy(() => import("./AttivitaAiTab"));

const VALID_TABS = ["chat", "memoria", "cervello", "sessioni", "attivita"] as const;
type TabKey = (typeof VALID_TABS)[number];

function isValidTab(v: string | null): v is TabKey {
  return v != null && (VALID_TABS as readonly string[]).includes(v);
}

export default function AIPersonasHub() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Prefetch in idle dei chunk lazy: il Cervello (grafo + starfield + NLP)
  // è un bundle pesante — senza prefetch il primo click sul tab pagava
  // download+parse a freddo (la lentezza percepita). Così quando l'utente
  // cambia tab il codice è già caldo e restano solo le query dati.
  useEffect(() => {
    const prefetch = () => {
      void import("@/components/ai/AIBrainGraph");
      void import("@/pages/azienda/AIMemoryPage");
      void import("./AIPersonasSessionsTab");
      void import("@/pages/azienda/AssistenteAIPage");
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(prefetch, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(prefetch, 1500);
    return () => window.clearTimeout(t);
  }, []);
  const tabParam = searchParams.get("tab");
  const activeTab: TabKey = isValidTab(tabParam) ? tabParam : "memoria";
  const attivita = useAttivitaAi(activeTab === "attivita");
  const inCorso = raggruppaAttivita(attivita.righe, attivita.dataUpdatedAt)
    .filter(riga => statoAttivita(riga, attivita.dataUpdatedAt) === "in_corso").length;
  const [chatVisitata, setChatVisitata] = useState(activeTab === "chat");
  if (activeTab === "chat" && !chatVisitata) setChatVisitata(true);

  const handleTabChange = (next: string) => {
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", next);
    setSearchParams(sp, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList aria-label="Assistente AI" className="flex h-auto min-h-11 max-w-full flex-wrap justify-start gap-1 rounded-xl border bg-muted/45">
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
            Mappa<span className="sr-only sm:not-sr-only"> della memoria</span>
          </TabsTrigger>
          <TabsTrigger value="sessioni" className="gap-2">
            <History className="h-4 w-4" />
            Conversazioni<span className="sr-only sm:not-sr-only"> precedenti</span>
          </TabsTrigger>
          <TabsTrigger value="attivita" className="gap-2 sm:ml-auto">
            <Activity className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            Attività AI
            {inCorso > 0 && (
              <span className="rounded-full bg-sky-100 px-1.5 text-[11px] font-semibold tabular-nums text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                aria-label={`${inCorso} in corso`}>
                {inCorso}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" forceMount={chatVisitata ? true : undefined}
          className={activeTab === "chat" ? "mt-4" : "hidden"}>
          <Suspense fallback={<TabSkeleton />}>
            <AssistenteAIPage key={attivita.ambito} embedded />
          </Suspense>
        </TabsContent>

        <TabsContent value="memoria" className="mt-4">
          <Suspense fallback={<TabSkeleton />}>
            <AIMemoryPage embedded />
          </Suspense>
        </TabsContent>

        <TabsContent value="cervello" className="mt-4">
          <Suspense fallback={<CervelloSkeleton />}>
            <AIBrainGraph />
          </Suspense>
        </TabsContent>

        <TabsContent value="sessioni" className="mt-4">
          <Suspense fallback={<TabSkeleton />}>
            <AIPersonasSessionsTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="attivita" className="mt-4">
          <Suspense fallback={<TabSkeleton />}>
            <AttivitaAiTab key={attivita.ambito} dati={attivita} apriChat={() => handleTabChange("chat")} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Fallback coerente col loader interno del grafo (sfondo scuro + brain
    pulsante): niente flash bianco di skeleton generici prima del canvas. */
function CervelloSkeleton() {
  return (
    <div className="flex h-[500px] items-center justify-center rounded-xl border border-slate-800 bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <Brain className="h-10 w-10 animate-pulse text-orange-400" />
        <p className="text-sm text-slate-300">Caricamento della mappa…</p>
      </div>
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
