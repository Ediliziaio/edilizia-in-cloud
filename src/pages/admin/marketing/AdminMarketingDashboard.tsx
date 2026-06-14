import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminMarketing } from "@/hooks/useAdminMarketing";
import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
import { LeadImportCard } from "@/components/admin/outreach/LeadImportCard";
import { SuppressionAddCard } from "@/components/admin/outreach/SuppressionAddCard";
import { OutreachSenderPool } from "@/components/admin/outreach/OutreachSenderPool";
import { OutreachSequences } from "@/components/admin/outreach/OutreachSequences";
import { OutreachReplyInbox } from "@/components/admin/outreach/OutreachReplyInbox";
import { OutreachComposeDialog } from "@/components/admin/outreach/OutreachComposeDialog";
import { OutreachMessagePlayground } from "@/components/admin/outreach/OutreachMessagePlayground";
import { OutreachAnalytics } from "@/components/admin/outreach/OutreachAnalytics";
import { OutreachPipelineAnalytics } from "@/components/admin/outreach/OutreachPipelineAnalytics";
import { OutreachConvertContactDialog } from "@/components/admin/outreach/OutreachConvertContactDialog";
import { OutreachOverdueFollowups } from "@/components/admin/outreach/OutreachOverdueFollowups";
import { EmailSuppressionsTable } from "@/components/admin/settings/EmailSuppressionsTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2, LayoutDashboard, Flame, Users, Send, Briefcase, ShieldCheck,
  Radar, Mail, MessageSquare, Phone, Workflow, ArrowRight, Construction,
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

function Kpi({ icon: Icon, label, value, hint, tone = "default" }: {
  icon: typeof Users; label: string; value: string; hint?: string;
  tone?: "default" | "good" | "warn";
}) {
  const toneCls = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="mt-0.5 rounded-lg bg-muted p-2"><Icon className="h-5 w-5 text-muted-foreground" /></div>
        <div className="min-w-0">
          <div className={`text-2xl font-bold leading-tight ${toneCls}`}>{value}</div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function Shortcut({ to, icon: Icon, label, desc }: { to: string; icon: typeof Mail; label: string; desc: string }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-orange-300 hover:bg-orange-50/40">
      <div className="rounded-lg bg-muted p-2 group-hover:bg-orange-100"><Icon className="h-5 w-5 text-muted-foreground group-hover:text-orange-600" /></div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{label}</div>
        <div className="truncate text-xs text-muted-foreground">{desc}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-orange-600" />
    </Link>
  );
}

function Soon({ phase, title, points }: { phase: string; title: string; points: string[] }) {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Construction className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">{phase}</span>
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {points.map((p) => (
            <li key={p} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />{p}</li>
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

  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("it-IT"));
  const contactable = contacts.data != null && suppressed.data != null
    ? Math.max(0, contacts.data - suppressed.data) : null;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Radar className="h-6 w-6 text-orange-500" /> Outreach Engine
          </h1>
          <p className="text-sm text-muted-foreground">
            La tua console quotidiana di cold outreach multi-canale. Email-first, poi WhatsApp e SMS.
          </p>
        </div>
        <OutreachComposeDialog companyId={companyId} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto justify-start gap-1 overflow-x-auto bg-muted/60 p-1 whitespace-nowrap">
          <TabsTrigger value="oggi"><Flame className="mr-1.5 h-4 w-4" /> Oggi</TabsTrigger>
          <TabsTrigger value="lead"><Users className="mr-1.5 h-4 w-4" /> Lead &amp; Liste</TabsTrigger>
          <TabsTrigger value="sequenze"><Send className="mr-1.5 h-4 w-4" /> Sequenze</TabsTrigger>
          <TabsTrigger value="pipeline"><Briefcase className="mr-1.5 h-4 w-4" /> Pipeline</TabsTrigger>
          <TabsTrigger value="deliverability"><ShieldCheck className="mr-1.5 h-4 w-4" /> Deliverability</TabsTrigger>
        </TabsList>

        {/* ── OGGI ── */}
        <TabsContent value="oggi" className="mt-4 space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={Users} label="Contatti in rubrica" value={fmt(contacts.data)} hint="nel CRM marketing admin" />
            <Kpi icon={ShieldCheck} label="Contattabili" value={fmt(contactable)} hint="al netto dei soppressi" tone="good" />
            <Kpi icon={ShieldCheck} label="Soppressi / opt-out" value={fmt(suppressed.data)} hint="bounce, lamentele, disiscritti" tone="warn" />
            <Kpi icon={Send} label="Campagne create" value={fmt(campaigns.data)} hint="totali nel sistema" />
          </div>

          <OutreachAnalytics companyId={companyId} />

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Scorciatoie</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Shortcut to="/admin/marketing/lead-scraper" icon={Radar} label="Lead Scraper" desc="Trova nuovi lead (6 sorgenti + AI)" />
              <Shortcut to="/admin/marketing/opportunita" icon={Briefcase} label="Pipeline opportunità" desc="Le risposte calde diventano deal" />
              <Shortcut to="/admin/marketing/email" icon={Mail} label="Email marketing" desc="Campagne e template" />
              <Shortcut to="/admin/marketing/whatsapp" icon={MessageSquare} label="WhatsApp" desc="Broadcast e template" />
              <Shortcut to="/admin/marketing/sms" icon={Phone} label="SMS" desc="Campagne SMS (Telnyx)" />
              <Shortcut to="/admin/marketing/automazioni" icon={Workflow} label="Automazioni" desc="Flussi e sequenze" />
            </CardContent>
          </Card>

          <OutreachReplyInbox companyId={companyId} />
        </TabsContent>

        {/* ── LEAD & LISTE ── */}
        <TabsContent value="lead" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Shortcut to="/admin/marketing/lead-scraper" icon={Radar} label="Lead Scraper" desc="Genera lead da Maps, LinkedIn, Apollo, Registro Imprese…" />
            <Shortcut to="/admin/marketing/contatti" icon={Users} label="Contatti CRM" desc="Rubrica, tag, segmenti" />
          </div>
          <LeadImportCard companyId={companyId} onImported={() => contacts.refetch()} />
          <OutreachMessagePlayground companyId={companyId} />
          <Soon phase="Fase 0 — prossimo" title="Opt-out per canale" points={[
            "La suppression email è già attiva (scheda Deliverability).",
            "Opt-out separato per SMS e WhatsApp arriva con la migrazione dedicata.",
          ]} />
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

        {/* ── DELIVERABILITY ── */}
        <TabsContent value="deliverability" className="mt-4 space-y-4">
          <OutreachSenderPool companyId={companyId} />
          <SuppressionAddCard companyId={companyId} />
          <EmailSuppressionsTable />
        </TabsContent>
      </Tabs>
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
