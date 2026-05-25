/**
 * AdminOperazioniHub — pagina hub per le Operazioni di piattaforma
 *
 * Consolida 5 voci sidebar separate (Sync Logs, Alert Failure, Import CSV,
 * Audit Log, GDPR) in un'unica pagina con 5 tab in alto.
 *
 * Stesso pattern del Fatturato hub e di /azienda/ordini.
 * Le route legacy fanno redirect verso il tab corrispondente.
 */
import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import {
  RefreshCw,
  AlertTriangle,
  FileUp,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeroHeader } from "@/components/admin/AdminHeroHeader";
import { AdminHubTabs, type AdminHubTab } from "@/components/admin/AdminHubTabs";

const SyncLogs = lazy(() => import("@/pages/admin/SyncLogs"));
const FailureAlertsPage = lazy(() => import("@/pages/admin/FailureAlertsPage"));
const CsvImportPage = lazy(() => import("@/pages/admin/CsvImportPage"));
const AuditLogPage = lazy(() => import("@/pages/admin/AuditLogPage"));
const AdminGDPR = lazy(() => import("@/pages/admin/AdminGDPR"));

type OperazioniTab = "sync" | "alert" | "import" | "audit" | "gdpr";

const VALID_TABS: readonly OperazioniTab[] = ["sync", "alert", "import", "audit", "gdpr"];

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
      label: "Sync Logs",
      icon: RefreshCw,
      show: permissions.can_view_platform_stats,
      description: "Log integrazioni e job batch",
    },
    {
      id: "alert" as const,
      label: "Alert Failure",
      icon: AlertTriangle,
      show: permissions.can_manage_companies,
      description: "Errori di sistema con notifica",
    },
    {
      id: "import" as const,
      label: "Import CSV",
      icon: FileUp,
      show: permissions.can_manage_companies,
      description: "Importazione massiva dati",
    },
    {
      id: "audit" as const,
      label: "Audit Log",
      icon: ShieldAlert,
      show: permissions.can_manage_companies,
      description: "Tracciato azioni utenti",
    },
    {
      id: "gdpr" as const,
      label: "GDPR",
      icon: ShieldCheck,
      show: permissions.can_manage_companies,
      description: "Compliance privacy e diritti GDPR",
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
        subtitle="Sync, alert, import, audit log e GDPR in un'unica vista."
      />

      {/* ─── Tab navigation ─────────────────────────────────────────────── */}
      <AdminHubTabs<OperazioniTab>
        activeTab={activeTab}
        onChange={handleTabChange}
        ariaLabel="Sezioni operazioni"
        tabs={tabs as AdminHubTab<OperazioniTab>[]}
      />

      {/* ─── Tab content ────────────────────────────────────────────────── */}
      <Suspense fallback={<HubTabSkeleton />}>
        {activeTab === "sync" && <SyncLogs />}
        {activeTab === "alert" && <FailureAlertsPage />}
        {activeTab === "import" && <CsvImportPage />}
        {activeTab === "audit" && <AuditLogPage />}
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
