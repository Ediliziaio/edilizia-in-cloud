/**
 * AdminOperazioniHub — pagina hub per le Operazioni di piattaforma
 *
 * Tre schede: Sincronizzazioni, Import CSV, GDPR.
 *
 * Tolte (30/10/2026):
 *  - «Alert Failure»: la tabella failure_alerts è vuota e nessuno ci scrive;
 *    errori e allarmi di piattaforma stanno in /admin/salute.
 *  - «Audit Log»: leggeva solo company_flag_audit_log, doppione del Registro
 *    attività (/admin/impostazioni/audit), che li unisce tutti.
 * Al loro posto due collegamenti sotto le schede. I vecchi link
 * ?tab=alert / ?tab=audit aprono la prima scheda e mettono in evidenza il
 * collegamento giusto.
 *
 * Le schede cambiano solo il parametro ?tab= sul percorso corrente
 * (setSearchParams): la pagina funziona uguale sotto /admin/operazioni e
 * sotto /admin/impostazioni/operazioni.
 */
import { lazy, Suspense } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  RefreshCw,
  FileUp,
  ShieldAlert,
  ShieldCheck,
  HeartPulse,
  Wrench,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeroHeader } from "@/components/admin/AdminHeroHeader";
import { AdminHubTabs, type AdminHubTab } from "@/components/admin/AdminHubTabs";

const SyncLogs = lazy(() => import("@/pages/admin/SyncLogs"));
const CsvImportPage = lazy(() => import("@/pages/admin/CsvImportPage"));
const AdminGDPR = lazy(() => import("@/pages/admin/AdminGDPR"));

type OperazioniTab = "sync" | "import" | "gdpr";

const VALID_TABS: readonly OperazioniTab[] = ["sync", "import", "gdpr"];

function isValidTab(value: string | null): value is OperazioniTab {
  return value != null && (VALID_TABS as readonly string[]).includes(value);
}

export default function AdminOperazioniHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { permissions } = useSuperAdminPermissions();

  const tabParam = searchParams.get("tab");
  const requestedTab: OperazioniTab = isValidTab(tabParam) ? tabParam : "sync";

  const tabs = [
    {
      id: "sync" as const,
      label: "Sincronizzazioni",
      icon: RefreshCw,
      show: permissions.can_view_platform_stats,
      description: "Registro delle integrazioni e dei lavori automatici",
    },
    {
      id: "import" as const,
      label: "Import CSV",
      icon: FileUp,
      show: permissions.can_manage_companies,
      description: "Caricamento di molti dati in una volta",
    },
    {
      id: "gdpr" as const,
      label: "GDPR",
      icon: ShieldCheck,
      show: permissions.can_manage_companies,
      description: "Privacy e richieste GDPR",
    },
  ].filter((t) => t.show);

  const activeTab: OperazioniTab = tabs.some((t) => t.id === requestedTab)
    ? requestedTab
    : (tabs[0]?.id ?? "sync");

  const handleTabChange = (tab: OperazioniTab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === "sync") next.delete("tab");
        else next.set("tab", tab);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-4 pb-20 sm:space-y-6 sm:pb-0">
      {/* ─── Hero header in stile Commesse ──────────────────────────────── */}
      <AdminHeroHeader
        icon={Wrench}
        title="Operazioni"
        subtitle="Sincronizzazioni, import CSV e GDPR in un'unica vista."
      />

      {/* ─── Tab navigation ─────────────────────────────────────────────── */}
      <AdminHubTabs<OperazioniTab>
        activeTab={activeTab}
        onChange={handleTabChange}
        ariaLabel="Sezioni operazioni"
        tabs={tabs as AdminHubTab<OperazioniTab>[]}
      />

      {/* ─── Dove sono finiti allarmi e registro ─────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {permissions.can_view_platform_stats && (
        <Link
          to="/admin/salute"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60",
            tabParam === "alert" && "border-orange-300 bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-200",
          )}
        >
          <HeartPulse className="h-3.5 w-3.5" />
          Errori e allarmi: Salute piattaforma
          <ArrowRight className="h-3 w-3" />
        </Link>
        )}
        {permissions.can_manage_companies && (
          <Link
            to="/admin/impostazioni/audit"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60",
              tabParam === "audit" && "border-orange-300 bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-200",
            )}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Registro attività
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* ─── Tab content ────────────────────────────────────────────────── */}
      <Suspense fallback={<HubTabSkeleton />}>
        {activeTab === "sync" && <SyncLogs />}
        {activeTab === "import" && <CsvImportPage />}
        {activeTab === "gdpr" && <AdminGDPR />}
      </Suspense>
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
