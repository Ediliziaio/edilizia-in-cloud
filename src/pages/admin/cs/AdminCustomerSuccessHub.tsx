/**
 * AdminCustomerSuccessHub — pagina hub per Customer Success Superadmin
 *
 * Consolida 5 voci sidebar separate (CS Dashboard, Assistenza, Lifecycle,
 * Onboarding, Playbook) in un'unica pagina con 5 tab in alto.
 *
 * Stesso pattern del Fatturato hub e di /azienda/ordini.
 *
 * Tab state via ?tab=... — le route legacy (/admin/cs-dashboard, /admin/ticket,
 * /admin/lifecycle, /admin/customer-success, /admin/playbooks) restano attive
 * come redirect verso il tab corrispondente.
 */
import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import {
  TrendingUp,
  MessageSquare,
  LifeBuoy,
  ListChecks,
  BookOpen,
  HeartHandshake,
  Brain,
} from "lucide-react";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeroHeader } from "@/components/admin/AdminHeroHeader";
import { AdminHubTabs, type AdminHubTab } from "@/components/admin/AdminHubTabs";

const AdminCSDashboard = lazy(() => import("@/pages/admin/AdminCSDashboard"));
const GlobalTickets = lazy(() => import("@/pages/admin/GlobalTickets"));
const CompanyLifecycle = lazy(() => import("@/pages/admin/CompanyLifecycle"));
const CustomerSuccess = lazy(() => import("@/pages/admin/CustomerSuccess"));
const PlaybooksPage = lazy(() => import("@/pages/admin/PlaybooksPage"));
// Cockpit Customer OS — daily brief + at-risk + upsell + action queue
const CockpitTab = lazy(() => import("./CockpitTab").then((m) => ({ default: m.CockpitTab })));

type CSTab = "cockpit" | "dashboard" | "assistenza" | "lifecycle" | "onboarding" | "playbook";

const VALID_TABS: readonly CSTab[] = ["cockpit", "dashboard", "assistenza", "lifecycle", "onboarding", "playbook"];

function isValidTab(value: string | null): value is CSTab {
  return value != null && (VALID_TABS as readonly string[]).includes(value);
}

export default function AdminCustomerSuccessHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { permissions } = useSuperAdminPermissions();

  const tabParam = searchParams.get("tab");
  const requestedTab: CSTab = isValidTab(tabParam) ? tabParam : "cockpit";

  const tabs = [
    {
      id: "cockpit" as const,
      label: "Cockpit AI",
      icon: Brain,
      show: permissions.can_manage_companies,
      description: "Daily brief + at-risk + upsell + action queue (Customer OS)",
    },
    {
      id: "dashboard" as const,
      label: "Dashboard",
      icon: TrendingUp,
      show: permissions.impersonation,
      description: "KPI health score, NPS, retention",
    },
    {
      id: "assistenza" as const,
      label: "Assistenza",
      icon: MessageSquare,
      show: permissions.can_manage_tickets,
      description: "Ticket di supporto utenti",
    },
    {
      id: "lifecycle" as const,
      label: "Lifecycle",
      icon: LifeBuoy,
      show: permissions.can_manage_companies,
      description: "Ciclo di vita cliente",
    },
    {
      id: "onboarding" as const,
      label: "Onboarding",
      icon: ListChecks,
      show: permissions.can_manage_companies,
      description: "Setup nuove aziende",
    },
    {
      id: "playbook" as const,
      label: "Playbook",
      icon: BookOpen,
      show: permissions.can_manage_companies,
      description: "Procedure operative CS",
    },
  ].filter((t) => t.show);

  const activeTab: CSTab = tabs.some((t) => t.id === requestedTab)
    ? requestedTab
    : (tabs[0]?.id ?? "cockpit");

  const handleTabChange = (tab: CSTab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        // Cockpit è il default → no ?tab= in URL per pulizia
        if (tab === "cockpit") next.delete("tab");
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
        icon={HeartHandshake}
        title="Assistenza Clienti"
        subtitle="Dashboard, ticket, lifecycle, onboarding e playbook in un'unica vista."
      />

      {/* ─── Tab navigation ─────────────────────────────────────────────── */}
      <AdminHubTabs<CSTab>
        activeTab={activeTab}
        onChange={handleTabChange}
        ariaLabel="Sezioni assistenza clienti"
        tabs={tabs as AdminHubTab<CSTab>[]}
      />

      {/* ─── Tab content ────────────────────────────────────────────────── */}
      <Suspense fallback={<HubTabSkeleton />}>
        {activeTab === "cockpit" && <CockpitTab />}
        {activeTab === "dashboard" && <AdminCSDashboard />}
        {activeTab === "assistenza" && <GlobalTickets />}
        {activeTab === "lifecycle" && <CompanyLifecycle />}
        {activeTab === "onboarding" && <CustomerSuccess />}
        {activeTab === "playbook" && <PlaybooksPage />}
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
