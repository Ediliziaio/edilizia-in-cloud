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
import { OutreachBrands } from "@/components/admin/outreach/OutreachBrands";
import { OutreachSendWindowCard } from "@/components/admin/outreach/OutreachSendWindowCard";
import { OutreachQueueStatus } from "@/components/admin/outreach/OutreachQueueStatus";
import { OutreachSequences } from "@/components/admin/outreach/OutreachSequences";
import { OutreachMailClient, PostaUnreadBadge } from "@/components/admin/outreach/OutreachMailClient";
import { OutreachInboxPreview } from "@/components/admin/outreach/OutreachInboxPreview";
import { OutreachActivityFeed } from "@/components/admin/outreach/OutreachActivityFeed";
import { OutreachLists } from "@/components/admin/outreach/OutreachLists";
import { OutreachComposeDialog } from "@/components/admin/outreach/OutreachComposeDialog";
import { OutreachMessagePlayground } from "@/components/admin/outreach/OutreachMessagePlayground";
import { OutreachAnalytics } from "@/components/admin/outreach/OutreachAnalytics";
import { OutreachPipelineAnalytics } from "@/components/admin/outreach/OutreachPipelineAnalytics";
import { OutreachStatsDashboard } from "@/components/admin/outreach/OutreachStatsDashboard";
import { OutreachConvertContactDialog } from "@/components/admin/outreach/OutreachConvertContactDialog";
import { OutreachOverdueFollowups } from "@/components/admin/outreach/OutreachOverdueFollowups";
import { EmailSuppressionsTable } from "@/components/admin/settings/EmailSuppressionsTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function Kpi({ icon: Icon, label, value, hint, tone = "default" }: {
  icon: typeof Users; label: string; value: string; hint?: string;
  tone?: "default" | "good" | "warn";
}) {
  const toneCls = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-foreground";
  const iconWrap = tone === "good"
    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-400"
    : tone === "warn"
      ? "bg-amber-50 text-amber-600 dark:bg-amber-900/25 dark:text-amber-400"
      : "bg-primary/10 text-primary";
  // hint come chip pill tonale (stile stat-card SaaS), non testo grigio piatto
  const hintChip = tone === "good"
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400"
    : tone === "warn"
      ? "bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-400"
      : "bg-muted text-muted-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconWrap}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className={`mt-2 text-2xl font-bold leading-tight tabular-nums ${toneCls}`}>{value}</div>
      {hint && (
        <span className={`mt-1.5 inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${hintChip}`}>
          {hint}
        </span>
      )}
    </div>
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

function ComplianceCard() {
  const items = [
    "Blocklist email attiva: bounce e lamentele rimuovono il contatto in automatico.",
    "Ogni arruolamento salta opt-out, contatti soppressi e chi è già in cadenza.",
    "Gestisci e aggiungi soppressioni nella scheda Deliverability.",
  ];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5 text-emerald-500" /> Conformità & opt-out
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {items.map((p) => (
            <li key={p} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />{p}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function OutreachCockpit() {
  const { companyId } = useAdminMarketing();
  const [tab, setTab] = useState("oggi");

  const contacts = useQuery({
    queryKey: ["outreach-count", "contacts", companyId],
    queryFn: () => safeCount(supabase.from("marketing_contacts").select("*", { count: "exact", head: true }).eq("company_id", companyId)),
    staleTime: 60_000,
  });
  const suppressed = useQuery({
    queryKey: ["outreach-count", "suppressed"],
    queryFn: () => safeCount(supabase.from("email_suppressions").select("*", { count: "exact", head: true })),
    staleTime: 60_000,
  });
  const campaigns = useQuery({
    queryKey: ["outreach-count", "campaigns"],
    queryFn: () => safeCount(supabase.from("crm_campaigns").select("*", { count: "exact", head: true })),
    staleTime: 60_000,
  });
  // Contattabili = contatti della company NON in opt-out. Corretto per costruzione:
  // prima si faceva contatti − soppressioni GLOBALI (insiemi non confrontabili) →
  // numero sbagliato mascherato dal Math.max(0, …).
  const contactable = useQuery({
    queryKey: ["outreach-count", "contactable", companyId],
    queryFn: () =>
      safeCount(
        supabase.from("marketing_contacts").select("*", { count: "exact", head: true })
          .eq("company_id", companyId).eq("optout_email", false),
      ),
    staleTime: 60_000,
  });

  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("it-IT"));

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
                  className="gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                  {t.badge}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* ── OGGI ── */}
          <TabsContent value="oggi" className="mt-5 space-y-6">
            <OutreachSetupChecklist companyId={companyId} />

            <div className="space-y-3">
              <SectionLabel>Panoramica</SectionLabel>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi icon={Users} label="Contatti in rubrica" value={fmt(contacts.data)} hint="nel CRM marketing admin" />
                <Kpi icon={ShieldCheck} label="Contattabili" value={fmt(contactable.data)} hint="esclusi gli opt-out email" tone="good" />
                <Kpi icon={ShieldCheck} label="Soppressi / opt-out" value={fmt(suppressed.data)} hint="bounce, lamentele, disiscritti" tone="warn" />
                <Kpi icon={Send} label="Campagne create" value={fmt(campaigns.data)} hint="totali nel sistema" />
              </div>
            </div>

            <div className="space-y-3">
              <SectionLabel>Motore &amp; performance</SectionLabel>
              <OutreachQueueStatus companyId={companyId} />
              <OutreachAnalytics companyId={companyId} />
            </div>

            <div className="space-y-3">
              <SectionLabel>Da leggere &amp; attività</SectionLabel>
              <div className="grid gap-4 lg:grid-cols-2">
                <OutreachInboxPreview companyId={companyId} onOpenMailbox={() => setTab("posta")} />
                <OutreachActivityFeed companyId={companyId} />
              </div>
            </div>

            <div className="space-y-3">
              <SectionLabel>Scorciatoie</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Shortcut to="/admin/marketing/lead-scraper" icon={Radar} label="Lead Scraper" desc="Trova nuovi lead (6 sorgenti + AI)" />
                <Shortcut to="/admin/marketing/opportunita" icon={Briefcase} label="Pipeline opportunità" desc="Le risposte calde diventano deal" />
                <Shortcut to="/admin/marketing/email" icon={Mail} label="Email marketing" desc="Campagne e template" />
                <Shortcut to="/admin/marketing/whatsapp" icon={MessageSquare} label="WhatsApp" desc="Broadcast e template" />
                <Shortcut to="/admin/marketing/sms" icon={Phone} label="SMS" desc="Campagne SMS (Telnyx)" />
                <Shortcut to="/admin/marketing/automazioni" icon={Workflow} label="Automazioni" desc="Flussi e sequenze" />
              </div>
            </div>
          </TabsContent>

        {/* ── POSTA ── */}
        {/* Full-bleed: la Posta è un vero client email e va a tutta larghezza/altezza.
            Annulliamo il padding orizzontale del container di pagina (-mx-4 sm:-mx-6)
            così le 3 colonne toccano i bordi dell'area contenuto invece di lasciare
            margini vuoti ai lati. Solo questa TabsContent — le altre restano nel max-w. */}
        <TabsContent value="posta" className="mt-3 -mx-4 sm:-mx-6">
          <OutreachMailClient companyId={companyId} />
        </TabsContent>

        {/* ── LEAD & LISTE ── */}
        <TabsContent value="lead" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Shortcut to="/admin/marketing/lead-scraper" icon={Radar} label="Lead Scraper" desc="Genera lead da Maps, LinkedIn, Apollo, Registro Imprese…" />
            <Shortcut to="/admin/marketing/contatti" icon={Users} label="Contatti CRM" desc="Rubrica, tag, segmenti" />
          </div>
          <LeadImportCard companyId={companyId} onImported={() => contacts.refetch()} />
          <OutreachLists companyId={companyId} />
          <OutreachMessagePlayground companyId={companyId} />
          <ComplianceCard />
        </TabsContent>

        {/* ── SEQUENZE ── */}
        <TabsContent value="sequenze" className="mt-4 space-y-4">
          <OutreachSequences companyId={companyId} />
          <Shortcut to="/admin/marketing/automazioni" icon={Workflow} label="Builder automazioni (esistente)" desc="Flussi event-based, complementari alle sequenze cold" />
        </TabsContent>

        {/* ── PIPELINE ── */}
        <TabsContent value="pipeline" className="mt-4 space-y-4">
          <OutreachPipelineAnalytics companyId={companyId} />
          <OutreachOverdueFollowups companyId={companyId} />
          <div className="flex justify-end"><OutreachConvertContactDialog companyId={companyId} /></div>
          <Shortcut to="/admin/marketing/opportunita" icon={Briefcase} label="Apri la pipeline (kanban)" desc="Trascina le opportunità tra gli stage" />
        </TabsContent>

        {/* ── STATISTICHE ── */}
        <TabsContent value="statistiche" className="mt-4">
          <OutreachStatsDashboard companyId={companyId} />
        </TabsContent>

        {/* ── DELIVERABILITY ── */}
        <TabsContent value="deliverability" className="mt-4 space-y-4">
          <OutreachBrands companyId={companyId} />
          <OutreachWarmupDashboard companyId={companyId} />
          <OutreachSenderPool companyId={companyId} />
          <OutreachSendWindowCard />
          <SuppressionAddCard companyId={companyId} />
          <EmailSuppressionsTable />
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
