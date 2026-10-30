/**
 * AdminSettingsEmail — shell di configurazione email piattaforma.
 *
 * Layout moderno sidebar + main area, allineato a pattern UX di /azienda/email.
 * Mantiene gli 8 tab esistenti e i loro sub-component (NON modificati).
 *
 * Desktop (≥md):
 *   ┌─────────────┬───────────────────────────────┐
 *   │ SIDEBAR     │ MAIN (Card)                   │
 *   │ icone+label │ contenuto sub-component       │
 *   │ active hl   │ lazy-mounted on first visit   │
 *   └─────────────┴───────────────────────────────┘
 *
 * Mobile (<md):
 *   - Sidebar collassata in <Select> compatto in alto.
 *   - Main area sotto, full-width.
 *
 * URL state: ?tab=<id> via useSearchParams (replace mode, niente history pollution).
 * Lazy-mount: pattern visitedTabs preservato, ogni tab montato solo dopo prima visita.
 */
/**
 * AdminSettingsEmail — la pagina Email della piattaforma, con UN solo livello di schede.
 *
 * Prima c'erano schede dentro schede (la «Configurazione» ne aveva altre sei, con nomi
 * inglesi: Delivery Log, Outbox, Rate Limits…) e «Mittente e aspetto» e «Dominio» stavano
 * in due pagine a parte. Ora è tutto qui, una scheda per argomento (30/10/2026).
 *
 * Desktop (≥md): elenco delle schede a sinistra, contenuto a destra.
 * Telefono (<md): una tendina in alto al posto dell'elenco.
 *
 * La scheda sta nell'URL: ?scheda=<id> (replace, niente cronologia sporca). I vecchi
 * ?tab= (settings, templates, …) vengono tradotti nella scheda nuova.
 * Ogni scheda si monta alla prima visita e poi resta montata ma nascosta: cambiare
 * scheda non perde filtri o modifiche non salvate.
 */
import { lazy, Suspense, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Mail,
  Settings,
  Send,
  BarChart3,
  Ban,
  Gauge,
  FileText,
  PenLine,
  Variable,
  Palette,
  AtSign,
  ScrollText,
  Inbox,
  ShieldCheck,
  Euro,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { EmailTestPanel } from "@/components/admin/settings/EmailTestPanel";

// I pannelli pesanti si scaricano solo quando si apre la loro scheda.
const lazyNamed = <K extends string>(loader: () => Promise<Record<K, ComponentType>>, key: K) =>
  lazy(() => loader().then((m) => ({ default: m[key] })));

const EmailWebhookConfig = lazyNamed(() => import("@/components/admin/settings/email/EmailWebhookConfig"), "EmailWebhookConfig");
const EmailProviderConfig = lazy(() =>
  import("@/components/admin/settings/email/EmailProviderConfig").then((m) => ({ default: m.EmailProviderConfig })),
);
const EmailPricingConfig = lazyNamed(() => import("@/components/admin/settings/email/EmailPricingConfig"), "EmailPricingConfig");
const WhatsAppPricingConfig = lazyNamed(() => import("@/components/admin/settings/email/WhatsAppPricingConfig"), "WhatsAppPricingConfig");
const EmailDashboard = lazyNamed(() => import("@/components/admin/settings/email/EmailDashboard"), "EmailDashboard");
const EmailDeliveryLog = lazyNamed(() => import("@/components/admin/settings/email/EmailDeliveryLog"), "EmailDeliveryLog");
const EmailOutboxPanel = lazyNamed(() => import("@/components/admin/settings/email/EmailOutboxPanel"), "EmailOutboxPanel");
const EmailDeliverabilityDashboard = lazyNamed(() => import("@/components/admin/settings/EmailDeliverabilityDashboard"), "EmailDeliverabilityDashboard");
const EmailSuppressionsTable = lazyNamed(() => import("@/components/admin/settings/EmailSuppressionsTable"), "EmailSuppressionsTable");
const EmailRateLimitsPanel = lazyNamed(() => import("@/components/admin/settings/EmailRateLimitsPanel"), "EmailRateLimitsPanel");
const EmailTemplatesPanel = lazyNamed(() => import("@/components/admin/settings/EmailTemplatesPanel"), "EmailTemplatesPanel");
const PlatformEmailSignaturePanel = lazyNamed(() => import("@/components/admin/settings/PlatformEmailSignaturePanel"), "PlatformEmailSignaturePanel");
const PlatformCustomFieldsPanel = lazyNamed(() => import("@/components/admin/settings/PlatformCustomFieldsPanel"), "PlatformCustomFieldsPanel");
const AdminSettingsEmailPreferences = lazy(() => import("./AdminSettingsEmailPreferences"));
const AdminSettingsEmailDomain = lazy(() => import("./AdminSettingsEmailDomain"));

const BASE = "/admin/impostazioni/email";

type SchedaEmail =
  | "provider"
  | "mittente"
  | "dominio"
  | "modelli"
  | "campi"
  | "firma"
  | "andamento"
  | "invii"
  | "coda"
  | "consegna"
  | "bloccati"
  | "limiti"
  | "prezzi"
  | "prova";

interface SchedaDef {
  id: SchedaEmail;
  label: string;
  description: string;
  icon: LucideIcon;
  skeletonHeight: string;
}

const SCHEDE_EMAIL: readonly SchedaDef[] = [
  { id: "provider", label: "Provider", description: "Servizi di invio (campagne e messaggi di servizio) e ritorni degli esiti", icon: Settings, skeletonHeight: "h-[400px]" },
  { id: "mittente", label: "Mittente e aspetto", description: "Nome del mittente, risposte, logo e colori delle email della piattaforma", icon: Palette, skeletonHeight: "h-[600px]" },
  { id: "dominio", label: "Dominio", description: "Il dominio da cui partono le email della piattaforma e le sue righe DNS", icon: AtSign, skeletonHeight: "h-[600px]" },
  { id: "modelli", label: "Modelli", description: "Testi delle email di servizio e di marketing", icon: FileText, skeletonHeight: "h-[500px]" },
  { id: "campi", label: "Campi nei modelli", description: "Le variabili che si possono usare nei modelli", icon: Variable, skeletonHeight: "h-[500px]" },
  { id: "firma", label: "Firma", description: "Firma della piattaforma in fondo alle email", icon: PenLine, skeletonHeight: "h-[400px]" },
  { id: "andamento", label: "Andamento", description: "Quante email partono, arrivano e tornano indietro", icon: BarChart3, skeletonHeight: "h-[400px]" },
  { id: "invii", label: "Invii", description: "Ogni email spedita, con esito ed errore", icon: ScrollText, skeletonHeight: "h-[400px]" },
  { id: "coda", label: "Coda", description: "Email in attesa di partire o da ritentare", icon: Inbox, skeletonHeight: "h-[400px]" },
  { id: "consegna", label: "Consegna e DNS", description: "Rimbalzi, segnalazioni di spam e stato DNS per azienda", icon: ShieldCheck, skeletonHeight: "h-[400px]" },
  { id: "bloccati", label: "Indirizzi bloccati", description: "Chi si è disiscritto o non riceve più email", icon: Ban, skeletonHeight: "h-[400px]" },
  { id: "limiti", label: "Limiti", description: "Quante email al minuto e al giorno può spedire ogni servizio", icon: Gauge, skeletonHeight: "h-[300px]" },
  { id: "prezzi", label: "Prezzi e margini", description: "Quanto costano e quanto facciamo pagare email e messaggi WhatsApp", icon: Euro, skeletonHeight: "h-[400px]" },
  { id: "prova", label: "Invio di prova", description: "Manda un'email di prova al volo", icon: Send, skeletonHeight: "h-[300px]" },
] as const;

const SCHEDE_VALIDE = new Set<SchedaEmail>(SCHEDE_EMAIL.map((t) => t.id));
const SCHEDA_PREDEFINITA: SchedaEmail = "provider";

/** I vecchi ?tab= dei link già in giro, tradotti nella scheda nuova. */
const DA_VECCHIO_TAB: Record<string, SchedaEmail> = {
  settings: "provider",
  templates: "modelli",
  "custom-fields": "campi",
  signature: "firma",
  deliverability: "consegna",
  suppressions: "bloccati",
  "rate-limits": "limiti",
  test: "prova",
};

function schedaEmailDaParametri(params: URLSearchParams): SchedaEmail {
  const scheda = params.get("scheda");
  if (scheda && SCHEDE_VALIDE.has(scheda as SchedaEmail)) return scheda as SchedaEmail;
  const vecchio = params.get("tab");
  if (vecchio && DA_VECCHIO_TAB[vecchio]) return DA_VECCHIO_TAB[vecchio];
  return SCHEDA_PREDEFINITA;
}

const FAILED_STATUSES = ["failed", "bounced", "error"];

/**
 * Stato reale del sistema email nelle ultime 24h (email_delivery_log).
 * Prima il badge "Sistema operativo" era hardcoded sempre-verde: mentiva
 * anche a provider giù. null = dato non disponibile (RLS/errore) → nascondi.
 */
function useEmailSystemHealth() {
  return useQuery({
    queryKey: ["admin-email-system-health-24h"],
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [totalRes, failedRes] = await Promise.all([
        supabase
          .from("email_delivery_log")
          .select("id", { count: "exact", head: true })
          .gte("sent_at", since),
        supabase
          .from("email_delivery_log")
          .select("id", { count: "exact", head: true })
          .gte("sent_at", since)
          .in("status", FAILED_STATUSES),
      ]);
      if (totalRes.error || failedRes.error) throw totalRes.error ?? failedRes.error;
      return { total: totalRes.count ?? 0, failed: failedRes.count ?? 0 };
    },
  });
}

function SystemHealthBadge() {
  const health = useEmailSystemHealth();

  // Dato non disponibile (loading/RLS/errore): meglio nessun badge che uno finto.
  if (!health.data) return null;

  const { total, failed } = health.data;
  const failRate = total > 0 ? failed / total : 0;
  const degraded = failed > 0 && (failRate >= 0.05 || failed >= 10);

  if (degraded) {
    return (
      <Badge variant="secondary" className="gap-1.5" title={`${failed} email fallite su ${total} nelle ultime 24 ore`}>
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
        {failed.toLocaleString("it-IT")} errori 24h
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1.5" title={`${total.toLocaleString("it-IT")} email nelle ultime 24 ore, ${failed} fallite`}>
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
      Sistema operativo
    </Badge>
  );
}

export default function AdminSettingsEmail() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = schedaEmailDaParametri(searchParams);

  const [visitedTabs, setVisitedTabs] = useState<Set<SchedaEmail>>(() => new Set<SchedaEmail>([activeTab]));

  // La scheda può cambiare anche senza passare da handleTabChange (link, avanti/indietro):
  // va segnata come visitata anche lì, altrimenti il pannello resta vuoto.
  if (!visitedTabs.has(activeTab)) {
    const merged = new Set(visitedTabs);
    merged.add(activeTab);
    setVisitedTabs(merged);
  }

  const handleTabChange = (next: SchedaEmail) => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        sp.delete("tab");
        if (next === SCHEDA_PREDEFINITA) sp.delete("scheda");
        else sp.set("scheda", next);
        return sp;
      },
      { replace: true },
    );
  };

  const activeDef = useMemo(
    () => SCHEDE_EMAIL.find((t) => t.id === activeTab) ?? SCHEDE_EMAIL[0],
    [activeTab],
  );

  const pannello = (id: SchedaEmail, contenuto: ReactNode) => {
    if (!visitedTabs.has(id)) return null;
    const def = SCHEDE_EMAIL.find((t) => t.id === id)!;
    return (
      <div key={id} hidden={activeTab !== id} className="space-y-6">
        <Suspense fallback={<Skeleton className={def.skeletonHeight} />}>{contenuto}</Suspense>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className="hidden sm:flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shrink-0"
            aria-hidden="true"
          >
            <Mail className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">Email</h1>
            <p className="text-sm text-muted-foreground mt-1 max-sm:hidden">
              Servizi di invio, mittente, dominio, modelli e andamento delle email della piattaforma.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 max-sm:hidden">
          <SystemHealthBadge />
        </div>
      </div>

      {/* Telefono: tendina al posto dell'elenco. */}
      <div className="md:hidden">
        <Select value={activeTab} onValueChange={(v) => handleTabChange(v as SchedaEmail)}>
          <SelectTrigger aria-label="Scegli la sezione" className="w-full">
            <SelectValue placeholder="Scegli la sezione" />
          </SelectTrigger>
          <SelectContent>
            {SCHEDE_EMAIL.map((tab) => {
              const Icon = tab.icon;
              return (
                <SelectItem key={tab.id} value={tab.id}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {tab.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <nav aria-label="Sezioni email" className="hidden md:block md:w-56 lg:w-60 shrink-0 md:sticky md:top-4">
          <Card className="overflow-hidden">
            <CardContent className="p-1.5">
              <ul className="flex flex-col gap-0.5">
                {SCHEDE_EMAIL.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = tab.id === activeTab;
                  return (
                    <li key={tab.id}>
                      <button
                        type="button"
                        onClick={() => handleTabChange(tab.id)}
                        aria-current={isActive ? "page" : undefined}
                        title={tab.description}
                        className={cn(
                          "group w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors border-l-2",
                          isActive
                            ? "border-l-primary bg-primary/10 text-foreground font-semibold"
                            : "border-l-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                      >
                        <Icon
                          className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </nav>

        <section className="flex-1 min-w-0" aria-label={activeDef.label}>
          {/* «Mittente e aspetto» ha già il suo titolo dentro: niente doppione. */}
          <div className={cn("mb-3 max-sm:hidden", activeTab === "mittente" && "hidden")}>
            <h2 className="text-base font-semibold leading-tight">{activeDef.label}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{activeDef.description}</p>
          </div>
          {pannello(
            "provider",
            <>
              <EmailWebhookConfig />
              <div className="grid grid-cols-1 items-start gap-6 2xl:grid-cols-2">
                <EmailProviderConfig stream="marketing" />
                <EmailProviderConfig stream="transactional" />
              </div>
            </>,
          )}
          {pannello("mittente", <AdminSettingsEmailPreferences linkDominio={`${BASE}?scheda=dominio`} />)}
          {pannello("dominio", <AdminSettingsEmailDomain linkPreferenze={`${BASE}?scheda=mittente`} />)}
          {pannello("modelli", <EmailTemplatesPanel />)}
          {pannello("campi", <PlatformCustomFieldsPanel />)}
          {pannello("firma", <PlatformEmailSignaturePanel />)}
          {pannello("andamento", <EmailDashboard />)}
          {pannello("invii", <EmailDeliveryLog />)}
          {pannello("coda", <EmailOutboxPanel />)}
          {pannello("consegna", <EmailDeliverabilityDashboard />)}
          {pannello("bloccati", <EmailSuppressionsTable />)}
          {pannello("limiti", <EmailRateLimitsPanel />)}
          {pannello(
            "prezzi",
            <>
              <EmailPricingConfig />
              {/* I prezzi WhatsApp stavano in una sotto-scheda «Prezzi WhatsApp» dentro Email: ora sono qui sotto,
                  con un titolo che dice chiaro che non sono email. */}
              <div className="space-y-2 border-t pt-6">
                <h3 className="text-base font-semibold">Messaggi WhatsApp</h3>
                <WhatsAppPricingConfig />
              </div>
            </>,
          )}
          {pannello("prova", <EmailTestPanel />)}
        </section>
      </div>
    </div>
  );
}
