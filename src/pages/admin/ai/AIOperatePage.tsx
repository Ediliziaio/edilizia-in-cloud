/**
 * AIOperatePage — Operatività AI (sostituisce vecchia /admin/silvio-hub)
 *
 * Schede: Da approvare · Coda · Regole · Agenti · Coordinatore · Assistenti del team · Memoria · Mappa 3D · Apprendimento
 *
 * Refactor Strategia C — consolida tutto ciò che è "operativo" del sistema AI
 * (azioni day-by-day, governance run-time). La vecchia /admin/silvio-hub
 * fa redirect qui.
 *
 * I tab Approvals e Queue mostrano badge counter live (count pending da DB).
 */
import { useState, useEffect, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Bot,
  Inbox,
  ListTodo,
  Settings,
  Network,
  Activity,
  Brain,
  Zap,
  Users,
  ShieldCheck,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AIPageHeader } from "@/components/admin/ai-shared/AIPageHeader";
import { AITabsList } from "@/components/admin/ai-shared/AITabsList";
import { SectionAlert } from "@/components/admin/ai-shared/SectionIntro";
import { useAIHubNested } from "@/components/admin/ai-shared/AIHubNestedContext";
import { ApprovalsTab } from "@/components/admin/silvio-hub/ApprovalsTab";
import { QueueTab } from "@/components/admin/silvio-hub/QueueTab";
import { PoliciesTab } from "@/components/admin/silvio-hub/PoliciesTab";
import { AgentsMissionTab } from "@/components/admin/silvio-hub/AgentsMissionTab";
import { ChiefOfStaffTab } from "@/components/admin/silvio-hub/ChiefOfStaffTab";
import { MemoryTab } from "@/components/admin/silvio-hub/MemoryTab";
import { LearningTab } from "@/components/admin/silvio-hub/LearningTab";
import { AdminPersonasTab } from "@/components/admin/silvio-hub/AdminPersonasTab";

// Cervello AI 3D (knowledge graph reagraph) — lazy: ~500KB di WebGL bundle
const AIBrainGraph = lazy(() => import("@/components/ai/AIBrainGraph"));

export default function AIOperatePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "approvals";
  const [activeTab, setActiveTab] = useState(initialTab);
  const { isNested, navigateToSection } = useAIHubNested();

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

  // Counter live per badge (refetch ogni 30s).
  // NB: AdminAIHub fa conditional mount/unmount → quando l'utente non è sulla
  // section "operate", AIOperatePage è unmounted e la query si ferma.
  // refetchIntervalInBackground=false (default) → niente refetch su tab non
  // visibile del browser.
  const { data: counters } = useQuery({
    queryKey: ["ai-operate-counters"],
    refetchInterval: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      const [approvals, queue, missions] = await Promise.all([
        sp.from("silvio_pending_approvals").select("id", { count: "exact", head: true }).eq("status", "awaiting"),
        sp.from("silvio_action_queue").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]),
        sp.from("silvio_agent_missions").select("id", { count: "exact", head: true }).in("status", ["planning", "queued", "running", "waiting_approval"]),
      ]);
      return {
        approvals: approvals.count ?? 0,
        queue: queue.count ?? 0,
        missions: missions.count ?? 0,
      };
    },
    staleTime: 15_000,
  });

  const TABS = [
    {
      value: "approvals",
      label: "Da approvare",
      icon: Inbox,
      count: counters?.approvals,
      countTone: counters?.approvals ? ("danger" as const) : ("default" as const),
    },
    {
      value: "queue",
      label: "Coda",
      icon: ListTodo,
      count: counters?.queue,
      countTone: counters?.queue ? ("warning" as const) : ("default" as const),
    },
    { value: "policies", label: "Regole", icon: ShieldCheck },
    {
      value: "agents",
      label: "Agenti",
      icon: Network,
      count: counters?.missions,
      countTone: "default" as const,
    },
    { value: "chief", label: "Coordinatore", icon: Activity },
    { value: "personas", label: "Assistenti del team", icon: Users },
    { value: "memory", label: "Memoria Admin", icon: Brain },
    { value: "cervello", label: "Mappa 3D", icon: Network },
    { value: "learning", label: "Apprendimento", icon: Zap },
  ];

  return (
    <div className={isNested ? "" : "p-4 md:p-6 max-w-screen-2xl mx-auto"}>
      {/* Header SOLO se non nested in AdminAIHub (che ha già il suo hero) */}
      {!isNested && (
        <AIPageHeader
          icon={Bot}
          title="AI · Operatività"
          subtitle="Operatività"
          description="Cosa fa Silvio adesso: azioni da approvare, coda, regole, missioni degli agenti, riepiloghi, memoria e apprendimento."
          quickLinks={[
            { label: "Configurazione", to: "/admin/ai?section=config", icon: Settings },
            { label: "Controllo", to: "/admin/ai?section=monitor", icon: Activity },
          ]}
          actions={
            counters && (counters.approvals > 0 || counters.queue > 0) ? (
              <div className="flex items-center gap-2 text-xs">
                {counters.approvals > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                    {counters.approvals} approval{counters.approvals === 1 ? "" : "s"}
                  </span>
                ) : null}
                {counters.queue > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                    {counters.queue} in coda
                  </span>
                ) : null}
              </div>
            ) : null
          }
        />
      )}
      {/* Quando nested: counter inline come strip leggera sopra le tab */}
      {isNested && counters && (counters.approvals > 0 || counters.queue > 0) ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {counters.approvals > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
              {counters.approvals} approval{counters.approvals === 1 ? "" : "s"}
            </span>
          ) : null}
          {counters.queue > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              {counters.queue} in coda
            </span>
          ) : null}
          {/* Quick switch sub-section senza redirect */}
          {navigateToSection && (
            <>
              <button
                type="button"
                onClick={() => navigateToSection("config")}
                className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
              >
                <Settings className="h-3 w-3" />
                Configurazione
              </button>
              <button
                type="button"
                onClick={() => navigateToSection("monitor")}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
              >
                <Activity className="h-3 w-3" />
                Controllo
              </button>
            </>
          )}
        </div>
      ) : null}

      <AITabsList
        value={activeTab}
        onValueChange={handleTabChange}
        tabs={TABS}
        contents={{
          approvals: (
            <>
              <SectionAlert.warning
                title="Azioni che aspettano il tuo OK"
                description="Silvio propone le azioni a rischio medio o alto e aspetta: con «Approva» l'azione parte, con «Rifiuta» si scarta e scrivi il motivo."
                bullets={[
                  "Una proposta scade dopo 60 minuti se nessuno risponde",
                  "Il motivo di un rifiuto insegna a Silvio cosa non proporre",
                  "Ogni scelta resta nel registro: chi, quando, cosa, com'è andata",
                ]}
              />
              <ApprovalsTab />
            </>
          ),
          queue: (
            <>
              <SectionAlert.info
                title="Coda delle azioni"
                description="Quello che Silvio sta facendo o ha fatto da poco. Filtra per stato (in coda, in corso, fatta, fallita, annullata); quelle fallite si possono rilanciare."
                bullets={[
                  "Runner esegue ogni 30s (silvio-action-runner cron)",
                  "Cancella o retry actions specifiche",
                  "Workflow runs aggregati (drip/dunning/campaigns)",
                ]}
              />
              <QueueTab />
            </>
          ),
          policies: (
            <>
              <SectionAlert.warning
                title="Regole di esecuzione"
                description="Per ogni tipo di azione scegli come la esegue Silvio, per tutte le aziende: da solo, da solo avvisando, solo dopo il tuo OK, mai."
                bullets={[
                  "Override hard: blocked = nessuno può eseguire, mai",
                  "I permessi per-azienda (in AI Config → Governance) si applicano DOPO questi",
                  "cancel_subscription, refund, delete_data sono blocked di default",
                ]}
                related={[
                  { label: "Permessi per-azienda", to: "/admin/ai?section=config&tab=governance" },
                ]}
              />
              <PoliciesTab />
            </>
          ),
          agents: (
            <>
              <SectionAlert.info
                title="Missioni degli agenti"
                description="Otto agenti specializzati (pianificazione, crescita, vendite, finanza, prodotto, assistenza clienti, controlli, coordinamento) lavorano da soli, a confronto o in catena su una missione."
                bullets={[
                  "Templates rapidi: MRR+cassa, SEO/Ads, Bug/UX, Sales OS, GDPR/AI Act",
                  "Blackboard pattern: agent condividono fact/insight/risk/recommendation",
                  "QA gate: qa_compliance_agent valuta prima del coordinator synthesis",
                  "Cost guard: max_cost_usd + max_runtime_seconds per agent",
                ]}
              />
              <AgentsMissionTab />
            </>
          ),
          chief: (
            <>
              <SectionAlert.success
                title="Coordinatore"
                description="Riepilogo strategico ogni mattina, indicatori fissi, eventi da tenere d'occhio ed esperimenti di crescita. Si aggiorna ogni giorno alle 08:15."
                bullets={[
                  "Brief: top_priorities, decisions_needed, risks, experiments_suggested",
                  "Strategic objectives: MRR growth, lead conversion, churn, AI cost, stability",
                  "Monitor rules: trigger automatici su soglie (es. costo AI > X €/giorno)",
                  "Growth experiments: AI suggerisce, tu approvi, sistema esegue",
                ]}
              />
              <ChiefOfStaffTab />
            </>
          ),
          personas: (
            <>
              <SectionAlert.warning
                title="Assistenti del team"
                description="I 21 assistenti che Silvio chiama in causa per le domande strategiche nella chat di Silvio: Beatrice (finanza), Marco (marketing), Sofia (operazioni) e gli altri."
                bullets={[
                  "Diverse dalle Personas Cliente (in AI Config → Personas)",
                  "system_prompt_addendum aggiunto al prompt costituzionale base",
                  "scope_topics + forbidden_topics governano l'attivazione automatica",
                  "panel_partners + debate_opponent abilitano modalità multi-voice",
                ]}
                related={[
                  { label: "Personas Cliente", to: "/admin/ai?section=config&tab=personas" },
                ]}
              />
              <AdminPersonasTab />
            </>
          ),
          memory: (
            <>
              <SectionAlert.info
                title="Memoria degli assistenti"
                description="Fatti, preferenze, decisioni e cose da evitare che ogni assistente ricorda nel tempo. Cresce da sola con le risposte e i rifiuti."
                bullets={[
                  "5 tipi: fact, preference, decision, pattern (good), avoid (negative)",
                  "Confidence + hits_count: i pattern usati più spesso salgono di priorità",
                  "Cron self-improvement (Domenica 03:00 UTC) promuove gold patterns",
                ]}
                related={[
                  { label: "Memoria sistema/azienda", to: "/admin/ai?section=config&tab=governance" },
                  { label: "Visualizza in 3D", to: "/admin/ai?tab=cervello" },
                ]}
              />
              <MemoryTab />
            </>
          ),
          cervello: (
            <>
              <SectionAlert.info
                title="Mappa 3D della conoscenza"
                description="I 21 assistenti e le loro memorie in 3D: si vede cosa sanno e cosa li collega."
                bullets={[
                  "Sorgente dati: silvio_admin_personas + silvio_persona_memory (scope globale platform)",
                  "Modalità vista: 2D piatto · 3D libero · Nucleo rotante (orbit camera)",
                  "Filtra per persona, tipo di memoria o range temporale (7d/30d/90d)",
                  "Real-time: nuove memorie appaiono live con pulse animation",
                ]}
                related={[
                  { label: "Gestisci memorie", to: "/admin/ai?tab=memory" },
                  { label: "Configura Personas", to: "/admin/ai?tab=personas" },
                ]}
              />
              <Suspense fallback={<BrainGraphSkeleton />}>
                <AIBrainGraph scope="admin" />
              </Suspense>
            </>
          ),
          learning: (
            <>
              <SectionAlert.success
                title="Apprendimento"
                description="Ogni settimana raccoglie i voti degli utenti alle risposte: le migliori diventano esempi da seguire, le peggiori cose da evitare, e finiscono nella memoria degli assistenti."
                bullets={[
                  "Cron Domenica 03:00 UTC (silvio-self-improvement)",
                  "Threshold promozione: hits_count >= 5 in 7gg",
                  "Visualizza ultime run + force run manuale",
                  "Embedding OpenAI text-embedding-3-small per similarity",
                ]}
                related={[
                  { label: "Test Lab (rating system)", to: "/admin/ai?section=monitor&tab=test-lab" },
                ]}
              />
              <LearningTab />
            </>
          ),
        }}
      />
    </div>
  );
}

function BrainGraphSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-[480px] w-full" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
