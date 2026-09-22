import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminMarketing } from "@/hooks/useAdminMarketing";
import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
import { LeadImportCard } from "@/components/admin/outreach/LeadImportCard";
import { SuppressionAddCard } from "@/components/admin/outreach/SuppressionAddCard";
import { OutreachSenderPool } from "@/components/admin/outreach/OutreachSenderPool";
import { OutreachWarmupDashboard } from "@/components/admin/outreach/OutreachWarmupDashboard";
import { OutreachSetupChecklist } from "@/components/admin/outreach/OutreachSetupChecklist";
import { OutreachLaunchReadiness } from "@/components/admin/outreach/OutreachLaunchReadiness";
import { OutreachBrands } from "@/components/admin/outreach/OutreachBrands";
import { OutreachDeliverabilityScore } from "@/components/admin/outreach/OutreachDeliverabilityScore";
import { OutreachQueueStatus } from "@/components/admin/outreach/OutreachQueueStatus";
import { OutreachPilotPulse } from "@/components/admin/outreach/OutreachPilotPulse";
import { OutreachSequences } from "@/components/admin/outreach/OutreachSequences";
import { OutreachMailClient, PostaUnreadBadge } from "@/components/admin/outreach/OutreachMailClient";
import { OutreachHotQueue } from "@/components/admin/outreach/OutreachHotQueue";
import { OutreachLists } from "@/components/admin/outreach/OutreachLists";
import { OutreachCallTasks } from "@/components/admin/outreach/OutreachCallTasks";
import { OutreachRubricaCard } from "@/components/admin/outreach/OutreachRubricaCard";
import { OutreachComposeDialog } from "@/components/admin/outreach/OutreachComposeDialog";
import { OutreachMessagePlayground } from "@/components/admin/outreach/OutreachMessagePlayground";
import { OutreachPipelineAnalytics } from "@/components/admin/outreach/OutreachPipelineAnalytics";
import { PipelineCampagne, StatisticheCampagne } from "@/components/admin/outreach/campagne/SezioniCampagne";
import { useCampagnaScelta } from "@/components/admin/outreach/campagne/useCampagneOutreach";
import { OutreachConvertContactDialog } from "@/components/admin/outreach/OutreachConvertContactDialog";
import { OutreachOverdueFollowups } from "@/components/admin/outreach/OutreachOverdueFollowups";
import { EmailSuppressionsTable } from "@/components/admin/settings/EmailSuppressionsTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Reveal } from "@/components/admin/Reveal";
import { BrandPageHeader } from "@/components/admin/BrandPageHeader";
import {
  Loader2, LayoutDashboard, Flame, Users, Send, Briefcase, ShieldCheck,
  Radar, Mail, MessageSquare, Phone, Workflow, ArrowRight, Inbox, BarChart3,
} from "lucide-react";

/**
 * Outreach Engine — console quotidiana del cold outreach multi-canale (admin).
 * Vive DENTRO la pagina esistente /admin/marketing (nessuna nuova rotta sidebar):
 * un hub a tab che assembla i pezzi già esistenti e farà crescere lo strato
 * sicurezza-volume (sender pool, warm-up, sequenze) fase per fase.
 * Vedi docs/superpowers/specs/2026-06-14-outreach-engine-design.md
 */

/** Conta righe in modo resiliente: se la query fallisce (RLS, tabella assente) ritorna null, mai un throw che rompe la UI. */
async function safeCount(
  builder: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number | null> {
  try {
    const { count, error } = await builder;
    return error ? null : count ?? 0;
  } catch {
    return null;
  }
}

/** Etichetta di sezione (uppercase, tracking) alla Instantly per separare i blocchi del cockpit. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>
  );
}


function Shortcut({ to, icon: Icon, label, desc }: { to: string; icon: typeof Mail; label: string; desc: string }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{label}</div>
        <div className="truncate text-xs text-muted-foreground">{desc}</div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}


function OutreachCockpit() {
  const { companyId } = useAdminMarketing();
  const [tab, setTab] = useState("oggi");
  // La campagna scelta è la stessa in Pipeline e Statistiche.
  const campagne = useCampagnaScelta(companyId);

  const contacts = useQuery({
    queryKey: ["outreach-count", "contacts", companyId],
    queryFn: () => safeCount(supabase.from("marketing_contacts").select("*", { count: "exact", head: true }).eq("company_id", companyId)),
    staleTime: 60_000,
  });
  // I contatori di rubrica (contattabili/soppressi/campagne) vivono ora dentro
  // OutreachRubricaCard con le STESSE queryKey → cache condivisa, zero doppioni.


  const tabs = [
    { value: "oggi", icon: Flame, label: "Oggi" },
    { value: "posta", icon: Inbox, label: "Posta", badge: <PostaUnreadBadge companyId={companyId} /> },
    { value: "lead", icon: Users, label: "Lead & Liste" },
    { value: "sequenze", icon: Send, label: "Sequenze" },
    { value: "pipeline", icon: Briefcase, label: "Pipeline" },
    { value: "statistiche", icon: BarChart3, label: "Statistiche" },
    { value: "deliverability", icon: ShieldCheck, label: "Deliverability" },
  ];

  return (
    <div className="min-h-full bg-muted/30">
      <div className="space-y-6 p-4 sm:p-6">
        {/* Header pagina — hero brand (navy + arancione) */}
        <BrandPageHeader
          icon={Radar}
          eyebrow="Cold Outreach"
          title="Outreach Engine"
          subtitle="La tua console quotidiana di cold outreach multi-canale. Email-first, poi WhatsApp e SMS."
          actions={<OutreachComposeDialog companyId={companyId} />}
        />

        <Tabs value={tab} onValueChange={setTab}>
          {/* Tab bar segmented/underline alla Instantly */}
          <div className="-mx-1 overflow-x-auto px-1 pb-px">
            <TabsList className="inline-flex h-auto items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
              {tabs.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-amber-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-orange-500/30"
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                  {t.badge}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* ── OGGI ──
              Gerarchia "cockpit vivo": prima il motore in funzione (invii,
              pilota, funnel), poi ciò che richiede AZIONE oggi (posta+attività),
              infine la rubrica come contesto e le scorciatoie. La rubrica
              (89k contatti, statica) prima stava in cima e spingeva giù i dati
              live. A motore avviato il setup è un banner slim. */}
          <TabsContent value="oggi" className="mt-5 space-y-6">
            <OutreachSetupChecklist companyId={companyId} />
            <OutreachLaunchReadiness companyId={companyId} />

            <Reveal className="space-y-3">
              <SectionLabel>Motore &amp; performance</SectionLabel>
              <OutreachQueueStatus companyId={companyId} />
              <OutreachPilotPulse companyId={companyId} />
              {/* Il funnel completo (aperture/clic/risposte + trend) vive nella
                  tab Statistiche: qui basta il polso del motore (coda + pilota). */}
              <button
                type="button"
                onClick={() => setTab("statistiche")}
                className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Risposte, rendimento per email e invii in programma, campagna per campagna
                <span className="ml-auto font-medium text-primary">Statistiche →</span>
              </button>
            </Reveal>

            <Reveal className="space-y-3" delay={0.06}>
              <SectionLabel>Risposte calde</SectionLabel>
              <OutreachHotQueue companyId={companyId} onOpenMailbox={() => setTab("posta")} />
            </Reveal>

            <Reveal className="space-y-3" delay={0.12}>
              <SectionLabel>Rubrica &amp; deliverability</SectionLabel>
              {/* Mini-dashboard interattiva (analytics-dashboard): anello =
                  % contattabile, tab Panoramica/Liste/Insight sui numeri veri.
                  Sostituisce la griglia di 4 KPI statici. */}
              <OutreachRubricaCard companyId={companyId} />
            </Reveal>

            <Reveal className="space-y-3" delay={0.18}>
              <SectionLabel>Scorciatoie</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Shortcut to="/admin/marketing/lead-scraper" icon={Radar} label="Lead Scraper" desc="Trova nuovi lead (6 sorgenti + AI)" />
                <Shortcut to="/admin/marketing/opportunita" icon={Briefcase} label="Pipeline opportunità" desc="Le risposte calde diventano deal" />
                <Shortcut to="/admin/marketing/email" icon={Mail} label="Email marketing" desc="Campagne e template" />
                <Shortcut to="/admin/marketing/whatsapp" icon={MessageSquare} label="WhatsApp" desc="Broadcast e template" />
                <Shortcut to="/admin/marketing/sms" icon={Phone} label="SMS" desc="Campagne SMS (Telnyx)" />
                <Shortcut to="/admin/marketing/automazioni" icon={Workflow} label="Automazioni" desc="Flussi e sequenze" />
              </div>
            </Reveal>
          </TabsContent>

        {/* ── POSTA ── */}
        {/* Full-bleed: la Posta è un vero client email e va a tutta larghezza/altezza.
            Annulliamo il padding orizzontale del container di pagina (-mx-4 sm:-mx-6)
            così le 3 colonne toccano i bordi dell'area contenuto invece di lasciare
            margini vuoti ai lati. Solo questa TabsContent — le altre restano nel max-w. */}
        <TabsContent value="posta" className="mt-3 -mx-4 sm:-mx-6">
          <OutreachMailClient companyId={companyId} />
        </TabsContent>

        {/* ── LEAD & LISTE ──
            Il cuore della tab sono LE LISTE (arruola da qui): prima stavano
            terze, sotto shortcut e import. Ora: liste in cima, poi "aggiungi
            contatti" (import + scraper/CRM) compatto, infine strumenti
            secondari (playground AI, conformità) sotto una loro sezione. */}
        <TabsContent value="lead" className="mt-4 space-y-6">
          {/* Layout denso stile Instantly: liste protagoniste a sinistra,
              operatività (chiamate da fare, import, scorciatoie) a destra.
              Sotto xl le sezioni tornano impilate nello stesso ordine. */}
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Reveal className="space-y-3">
              <SectionLabel>Le tue liste — arruola in una sequenza</SectionLabel>
              <OutreachLists companyId={companyId} />
            </Reveal>

            <div className="space-y-6">
              <Reveal className="space-y-3" delay={0.03}>
                <SectionLabel>Chiamate da fare</SectionLabel>
                <OutreachCallTasks companyId={companyId} />
              </Reveal>

              <Reveal className="space-y-3" delay={0.06}>
                <SectionLabel>Aggiungi contatti</SectionLabel>
                <LeadImportCard companyId={companyId} onImported={() => contacts.refetch()} />
                <div className="grid gap-3">
                  <Shortcut to="/admin/marketing/lead-scraper" icon={Radar} label="Lead Scraper" desc="Genera lead da Maps, LinkedIn, Apollo, Registro Imprese…" />
                  <Shortcut to="/admin/marketing/contatti" icon={Users} label="Contatti CRM" desc="Rubrica, tag, segmenti" />
                </div>
              </Reveal>
            </div>
          </div>

          <Reveal className="space-y-3" delay={0.12}>
            <SectionLabel>Strumenti</SectionLabel>
            <OutreachMessagePlayground companyId={companyId} />
          </Reveal>
        </TabsContent>

        {/* ── SEQUENZE ── */}
        <TabsContent value="sequenze" className="mt-4 space-y-4">
          <OutreachSequences companyId={companyId} />
          <Shortcut to="/admin/marketing/automazioni" icon={Workflow} label="Builder automazioni (esistente)" desc="Flussi event-based, complementari alle sequenze cold" />
        </TabsContent>

        {/* ── PIPELINE ──
            Ogni campagna ha la SUA pipeline: dove sono adesso i suoi contatti
            (da contattare → email 1…N → finito, più risposte e uscite), con
            l'elenco di chi c'è in ogni fase. Sotto, quello che succede DOPO una
            risposta: le opportunità commerciali. */}
        <TabsContent value="pipeline" className="mt-4 space-y-6">
          <Reveal className="space-y-3">
            <SectionLabel>Pipeline della campagna</SectionLabel>
            <PipelineCampagne companyId={companyId} sc={campagne} onVaiSequenze={() => setTab("sequenze")} />
          </Reveal>
          <Reveal className="space-y-3" delay={0.06}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionLabel>Dopo la risposta — opportunità</SectionLabel>
              <OutreachConvertContactDialog companyId={companyId} />
            </div>
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <OutreachOverdueFollowups companyId={companyId} />
              <OutreachPipelineAnalytics companyId={companyId} />
            </div>
            <Shortcut to="/admin/marketing/opportunita" icon={Briefcase} label="Apri la pipeline opportunità (kanban)" desc="Trascina le opportunità tra gli stage" />
          </Reveal>
        </TabsContent>

        {/* ── STATISTICHE ── per campagna, o la panoramica di tutte. */}
        <TabsContent value="statistiche" className="mt-4">
          <StatisticheCampagne companyId={companyId} sc={campagne} onVaiSequenze={() => setTab("sequenze")} />
        </TabsContent>

        {/* ── DELIVERABILITY ──
            Sei card impilate senza gerarchia: raggruppate per domanda reale —
            "da chi parto?" (identità), "quanto posso spingere?" (warm-up e
            finestre), "chi non devo contattare?" (blocklist). */}
        <TabsContent value="deliverability" className="mt-4 space-y-6">
          <Reveal>
            <OutreachDeliverabilityScore companyId={companyId} />
          </Reveal>
          <Reveal className="space-y-3">
            <SectionLabel>Identità di invio — brand, domini e caselle</SectionLabel>
            <OutreachBrands companyId={companyId} />
            <OutreachSenderPool companyId={companyId} />
          </Reveal>
          <Reveal className="space-y-3" delay={0.06}>
            {/* Gli orari d'invio li decide ogni brand (scheda qui sopra, riga «Orari»):
                la finestra di piattaforma fermava il motore prima di guardarli. */}
            <SectionLabel>Ritmo — warm-up</SectionLabel>
            <OutreachWarmupDashboard companyId={companyId} />
          </Reveal>
          <Reveal className="space-y-3" delay={0.12}>
            <SectionLabel>Blocklist — chi non va contattato</SectionLabel>
            <SuppressionAddCard companyId={companyId} />
            <EmailSuppressionsTable />
          </Reveal>
        </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function AdminMarketingDashboard() {
  const { hasAccess, permLoading } = useAdminMarketing();

  if (permLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <LayoutDashboard className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-lg font-semibold text-muted-foreground">Accesso negato</h2>
      </div>
    );
  }

  return (
    <PlatformCompanyProvider>
      <OutreachCockpit />
    </PlatformCompanyProvider>
  );
}
