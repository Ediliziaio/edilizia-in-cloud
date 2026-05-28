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
import { lazy, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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

// Lazy import dei sub-component pesanti.
// NOTA: i nomi dei tab e i sub-component sono invariati rispetto alla versione
// precedente — qui cambia solo l'orchestrazione/layout della shell.
const EmailSettingsTab = lazy(() => import("@/components/admin/settings/EmailSettingsTab"));
const EmailDeliverabilityDashboard = lazy(() =>
  import("@/components/admin/settings/EmailDeliverabilityDashboard").then((m) => ({
    default: m.EmailDeliverabilityDashboard,
  })),
);
const EmailSuppressionsTable = lazy(() =>
  import("@/components/admin/settings/EmailSuppressionsTable").then((m) => ({
    default: m.EmailSuppressionsTable,
  })),
);
const EmailRateLimitsPanel = lazy(() =>
  import("@/components/admin/settings/EmailRateLimitsPanel").then((m) => ({
    default: m.EmailRateLimitsPanel,
  })),
);
const EmailTemplatesPanel = lazy(() =>
  import("@/components/admin/settings/EmailTemplatesPanel").then((m) => ({
    default: m.EmailTemplatesPanel,
  })),
);
const PlatformEmailSignaturePanel = lazy(() =>
  import("@/components/admin/settings/PlatformEmailSignaturePanel").then((m) => ({
    default: m.PlatformEmailSignaturePanel,
  })),
);
const PlatformCustomFieldsPanel = lazy(() =>
  import("@/components/admin/settings/PlatformCustomFieldsPanel").then((m) => ({
    default: m.PlatformCustomFieldsPanel,
  })),
);

type TabId =
  | "settings"
  | "templates"
  | "custom-fields"
  | "signature"
  | "deliverability"
  | "suppressions"
  | "rate-limits"
  | "test";

interface TabDef {
  id: TabId;
  label: string;
  shortLabel?: string;
  description: string;
  icon: LucideIcon;
  skeletonHeight: string;
}

const TABS: readonly TabDef[] = [
  {
    id: "settings",
    label: "Configurazione",
    description: "Provider SMTP e parametri base",
    icon: Settings,
    skeletonHeight: "h-[400px]",
  },
  {
    id: "templates",
    label: "Template",
    description: "Email transazionali e marketing",
    icon: FileText,
    skeletonHeight: "h-[500px]",
  },
  {
    id: "custom-fields",
    label: "Campi personalizzati",
    shortLabel: "Campi",
    description: "Variabili dinamiche disponibili nei template",
    icon: Variable,
    skeletonHeight: "h-[500px]",
  },
  {
    id: "signature",
    label: "Firma",
    description: "Firma piattaforma applicata alle email",
    icon: PenLine,
    skeletonHeight: "h-[400px]",
  },
  {
    id: "deliverability",
    label: "Deliverability",
    description: "Bounce, complaint rate, DNS",
    icon: BarChart3,
    skeletonHeight: "h-[400px]",
  },
  {
    id: "suppressions",
    label: "Soppressioni",
    description: "Lista email bloccate / unsubscribe",
    icon: Ban,
    skeletonHeight: "h-[400px]",
  },
  {
    id: "rate-limits",
    label: "Rate Limits",
    description: "Throttling invio per provider",
    icon: Gauge,
    skeletonHeight: "h-[300px]",
  },
  {
    id: "test",
    label: "Test Invio",
    shortLabel: "Test",
    description: "Invia email di prova al volo",
    icon: Send,
    skeletonHeight: "h-[300px]",
  },
] as const;

const VALID_TAB_IDS = new Set<TabId>(TABS.map((t) => t.id));

function isValidTab(value: string | null): value is TabId {
  return value !== null && VALID_TAB_IDS.has(value as TabId);
}

export default function AdminSettingsEmail() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TabId = isValidTab(tabParam) ? tabParam : "settings";

  // PERF: lazy-mount delle 8 tab. Senza, tutti i 7 lazy chunk verrebbero
  // scaricati al primo paint anche se l'utente vede solo "Configurazione".
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(() => new Set<TabId>([activeTab]));

  const handleTabChange = (next: TabId) => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        if (next === "settings") sp.delete("tab");
        else sp.set("tab", next);
        return sp;
      },
      { replace: true },
    );
    setVisitedTabs((prev) => {
      if (prev.has(next)) return prev;
      const merged = new Set(prev);
      merged.add(next);
      return merged;
    });
  };

  const activeDef = useMemo(
    () => TABS.find((t) => t.id === activeTab) ?? TABS[0],
    [activeTab],
  );

  const isMounted = (id: TabId) => visitedTabs.has(id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className="hidden sm:flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shrink-0"
            aria-hidden="true"
          >
            <Mail className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">Configurazione Email Platform</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Provider, template, deliverability, soppressioni e rate limits in un unico hub.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Badge variant="secondary" className="gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Sistema operativo
          </Badge>
          <Badge variant="outline" className="font-normal">
            {TABS.length} sezioni
          </Badge>
        </div>
      </div>

      {/* Mobile: Select per la navigazione tab. Visibile solo <md. */}
      <div className="md:hidden">
        <Select value={activeTab} onValueChange={(v) => handleTabChange(v as TabId)}>
          <SelectTrigger aria-label="Seleziona sezione email" className="w-full">
            <SelectValue placeholder="Seleziona sezione" />
          </SelectTrigger>
          <SelectContent>
            {TABS.map((tab) => {
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

      {/* Layout sidebar + main (desktop) / stack (mobile) */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        {/* Sidebar desktop */}
        <nav
          role="navigation"
          aria-label="Navigazione configurazione email"
          className="hidden md:block md:w-64 lg:w-72 shrink-0"
        >
          <Card className="overflow-hidden">
            <CardContent className="p-2">
              <ul className="flex flex-col gap-0.5">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = tab.id === activeTab;
                  return (
                    <li key={tab.id}>
                      <button
                        type="button"
                        onClick={() => handleTabChange(tab.id)}
                        aria-current={isActive ? "page" : undefined}
                        aria-label={`${tab.label} — ${tab.description}`}
                        className={cn(
                          "group w-full flex items-start gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                          "border-l-2",
                          isActive
                            ? "border-l-primary bg-primary/10 text-foreground font-semibold"
                            : "border-l-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 mt-0.5 shrink-0",
                            isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block leading-tight">{tab.label}</span>
                          <span
                            className={cn(
                              "block text-[11px] font-normal leading-snug mt-0.5",
                              isActive ? "text-muted-foreground" : "text-muted-foreground/80",
                            )}
                          >
                            {tab.description}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </nav>

        {/* Main area */}
        <section className="flex-1 min-w-0">
          <Card>
            <CardContent className="p-4 sm:p-6">
              {/* Sub-header sezione attiva */}
              <div className="mb-4 sm:mb-6 flex items-start gap-3 pb-4 border-b">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0"
                  aria-hidden="true"
                >
                  <activeDef.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold leading-tight">{activeDef.label}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{activeDef.description}</p>
                </div>
              </div>

              {/* Pannelli — solo il tab attivo viene effettivamente reso.
                  visitedTabs garantisce che ogni sub-component venga montato
                  una sola volta (preserva stato interno tra cambi tab). */}
              <div role="tabpanel" aria-label={activeDef.label}>
                {activeTab === "settings" && isMounted("settings") && (
                  <Suspense fallback={<Skeleton className="h-[400px]" />}>
                    <EmailSettingsTab />
                  </Suspense>
                )}
                {activeTab === "templates" && isMounted("templates") && (
                  <Suspense fallback={<Skeleton className="h-[500px]" />}>
                    <EmailTemplatesPanel />
                  </Suspense>
                )}
                {activeTab === "custom-fields" && isMounted("custom-fields") && (
                  <Suspense fallback={<Skeleton className="h-[500px]" />}>
                    <PlatformCustomFieldsPanel />
                  </Suspense>
                )}
                {activeTab === "signature" && isMounted("signature") && (
                  <Suspense fallback={<Skeleton className="h-[400px]" />}>
                    <PlatformEmailSignaturePanel />
                  </Suspense>
                )}
                {activeTab === "deliverability" && isMounted("deliverability") && (
                  <Suspense fallback={<Skeleton className="h-[400px]" />}>
                    <EmailDeliverabilityDashboard />
                  </Suspense>
                )}
                {activeTab === "suppressions" && isMounted("suppressions") && (
                  <Suspense fallback={<Skeleton className="h-[400px]" />}>
                    <EmailSuppressionsTable />
                  </Suspense>
                )}
                {activeTab === "rate-limits" && isMounted("rate-limits") && (
                  <Suspense fallback={<Skeleton className="h-[300px]" />}>
                    <EmailRateLimitsPanel />
                  </Suspense>
                )}
                {activeTab === "test" && isMounted("test") && <EmailTestPanel />}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
