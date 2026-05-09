/**
 * AIOperatePage — Operatività AI (sostituisce vecchia /admin/silvio-hub)
 *
 * 8 tab: Approvals · Queue · Policies · Agents · Chief · Personas Admin · Memory · Learning
 *
 * Refactor Strategia C — consolida tutto ciò che è "operativo" del sistema AI
 * (azioni day-by-day, governance run-time). La vecchia /admin/silvio-hub
 * fa redirect qui.
 *
 * I tab Approvals e Queue mostrano badge counter live (count pending da DB).
 */
import { useState, useEffect } from "react";
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
import { AIPageHeader } from "@/components/admin/ai-shared/AIPageHeader";
import { AITabsList } from "@/components/admin/ai-shared/AITabsList";
import { SectionAlert } from "@/components/admin/ai-shared/SectionIntro";
import { ApprovalsTab } from "@/components/admin/silvio-hub/ApprovalsTab";
import { QueueTab } from "@/components/admin/silvio-hub/QueueTab";
import { PoliciesTab } from "@/components/admin/silvio-hub/PoliciesTab";
import { AgentsMissionTab } from "@/components/admin/silvio-hub/AgentsMissionTab";
import { ChiefOfStaffTab } from "@/components/admin/silvio-hub/ChiefOfStaffTab";
import { MemoryTab } from "@/components/admin/silvio-hub/MemoryTab";
import { LearningTab } from "@/components/admin/silvio-hub/LearningTab";
import { AdminPersonasTab } from "@/components/admin/silvio-hub/AdminPersonasTab";

export default function AIOperatePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "approvals";
  const [activeTab, setActiveTab] = useState(initialTab);

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

  // Counter live per badge (refetch ogni 30s)
  const { data: counters } = useQuery({
    queryKey: ["ai-operate-counters"],
    refetchInterval: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      const [approvals, queue, missions] = await Promise.all([
        sp.from("silvio_pending_approvals").select("id", { count: "exact", head: true }).eq("status", "awaiting"),
        sp.from("silvio_action_queue").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]),
        sp.from("silvio_agent_missions").select("id", { count: "exact", head: true }).in("status", ["running", "waiting_approval"]),
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
      label: "Approvals",
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
    { value: "policies", label: "Policies", icon: ShieldCheck },
    {
      value: "agents",
      label: "Agenti",
      icon: Network,
      count: counters?.missions,
      countTone: "default" as const,
    },
    { value: "chief", label: "Chief", icon: Activity },
    { value: "personas", label: "Personas Admin", icon: Users },
    { value: "memory", label: "Memoria", icon: Brain },
    { value: "learning", label: "Learning", icon: Zap },
  ];

  return (
    <div className="p-4 md:p-6 max-w-screen-2xl mx-auto">
      <AIPageHeader
        icon={Bot}
        title="AI · Operatività"
        subtitle="Operatività"
        description="Cosa fa Silvio in questo momento. Approvazioni in attesa, azioni in coda, policy run-time, missioni multi-agent, brief strategici, memoria e self-learning."
        quickLinks={[
          { label: "Configurazione", to: "/admin/ai-config", icon: Settings },
          { label: "Monitor live", to: "/admin/ai-monitor", icon: Activity },
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

      <AITabsList
        value={activeTab}
        onValueChange={handleTabChange}
        tabs={TABS}
        contents={{
          approvals: (
            <>
              <SectionAlert.warning
                title="Approvals — azioni che richiedono il tuo OK"
                description="Silvio propone azioni rischiose (yellow/red risk level) e si ferma in attesa che tu approvi o rifiuti. Click 'Approva' → eseguito. Click 'Modifica' → puoi cambiare i parametri prima di eseguire."
                bullets={[
                  "Le approvazioni scadono dopo X minuti (default 60min)",
                  "Reject + feedback alimenta self-learning loop",
                  "Audit log completo: chi/quando/cosa/risultato",
                ]}
              />
              <ApprovalsTab />
            </>
          ),
          queue: (
            <>
              <SectionAlert.info
                title="Coda azioni outbound"
                description="Tutto ciò che Silvio sta eseguendo o ha eseguito di recente. Filtri per status (queued/running/done/failed/cancelled). Retry su failure."
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
                title="Automation Policies (gate globale)"
                description="Definisci per ogni action_type quale modalità di esecuzione applicare globalmente: auto / auto+notify / approval_required / blocked."
                bullets={[
                  "Override hard: blocked = nessuno può eseguire, mai",
                  "I permessi per-azienda (in AI Config → Governance) si applicano DOPO questi",
                  "cancel_subscription, refund, delete_data sono blocked di default",
                ]}
                related={[
                  { label: "Permessi per-azienda", to: "/admin/ai-config?tab=governance" },
                ]}
              />
              <PoliciesTab />
            </>
          ),
          agents: (
            <>
              <SectionAlert.info
                title="Multi-Agent Missions"
                description="Sistema multi-agent orchestrato (8 agent: planner, growth, sales, finance, product_tech, customer_success, qa_compliance, coordinator). Mode: solo / panel / debate / chain / supervised_execution."
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
                title="Chief of Staff — strategic OS"
                description="Brief strategici giornalieri, KPI permanenti, monitor events e growth experiments. Cron daily 06:15 UTC."
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
                title="Personas Admin C-suite"
                description="Le 21 personas che Silvio attiva quando rispondi a una domanda strategica nella chat /admin/silvio: Beatrice CFO, Marco CMO, Sofia COO, ecc."
                bullets={[
                  "Diverse dalle Personas Cliente (in AI Config → Personas)",
                  "system_prompt_addendum aggiunto al prompt costituzionale base",
                  "scope_topics + forbidden_topics governano l'attivazione automatica",
                  "panel_partners + debate_opponent abilitano modalità multi-voice",
                ]}
                related={[
                  { label: "Personas Cliente", to: "/admin/ai-config?tab=personas" },
                ]}
              />
              <AdminPersonasTab />
            </>
          ),
          memory: (
            <>
              <SectionAlert.info
                title="Memoria persona-specific"
                description="silvio_persona_memory — fatti/preferenze/decisioni/pattern/avoid che ogni persona admin ricorda nel tempo. Alimentata dal self-learning loop."
                bullets={[
                  "5 tipi: fact, preference, decision, pattern (good), avoid (negative)",
                  "Confidence + hits_count: i pattern usati più spesso salgono di priorità",
                  "Cron self-improvement (Domenica 03:00 UTC) promuove gold patterns",
                ]}
                related={[
                  { label: "Memoria sistema/azienda", to: "/admin/ai-config?tab=governance" },
                ]}
              />
              <MemoryTab />
            </>
          ),
          learning: (
            <>
              <SectionAlert.success
                title="Self-Learning Loop"
                description="Sistema MP-05: aggrega rating utenti settimanali → estrae gold (top-rated) e avoid (bottom-rated) patterns → promuove in persona memory automaticamente."
                bullets={[
                  "Cron Domenica 03:00 UTC (silvio-self-improvement)",
                  "Threshold promozione: hits_count >= 5 in 7gg",
                  "Visualizza ultime run + force run manuale",
                  "Embedding OpenAI text-embedding-3-small per similarity",
                ]}
                related={[
                  { label: "Test Lab (rating system)", to: "/admin/ai-monitor?tab=test-lab" },
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
