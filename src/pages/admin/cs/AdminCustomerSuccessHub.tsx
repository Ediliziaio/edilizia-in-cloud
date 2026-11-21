/**
 * AdminCustomerSuccessHub — pagina hub per Customer Success Superadmin
 *
 * Apre la coda ticket e mantiene le altre sezioni raggiungibili dalle schede.
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
import { AccessDenied } from "@/components/admin/AccessDenied";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeroHeader } from "@/components/admin/AdminHeroHeader";
import { AdminHubTabs } from "@/components/admin/AdminHubTabs";
import GlobalTickets from "@/pages/admin/GlobalTickets";

const AdminCSDashboard = lazy(() => import("@/pages/admin/AdminCSDashboard"));
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
  const { permissions, isLoading } = useSuperAdminPermissions();

  const tabParam = searchParams.get("tab");
  const requestedTab: CSTab = isValidTab(tabParam) ? tabParam : "assistenza";

  const tabs = [
    {
      id: "assistenza" as const,
      label: "Ticket",
      icon: MessageSquare,
      show: permissions.can_manage_tickets,
      description: "Richieste di supporto delle aziende",
    },
    {
      id: "cockpit" as const,
      label: "Priorità clienti",
      icon: Brain,
      show: permissions.can_manage_companies,
      description: "Clienti da seguire e proposte dell’intelligenza artificiale da verificare",
    },
    {
      id: "dashboard" as const,
      label: "Indicatori",
      icon: TrendingUp,
      show: permissions.impersonation,
      description: "Conteggi di assistenza e andamento delle aziende",
    },
    {
      id: "lifecycle" as const,
      label: "Aziende",
      icon: LifeBuoy,
      show: permissions.can_manage_companies,
      description: "Aziende attive, in prova, sospese e da ricontattare",
    },
    {
      id: "onboarding" as const,
      label: "Avvio clienti",
      icon: ListChecks,
      show: permissions.can_manage_companies,
      description: "Modelli e attività guidate per le nuove aziende",
    },
    {
      id: "playbook" as const,
      label: "Automazioni",
      icon: BookOpen,
      show: permissions.can_manage_companies,
      description: "Regole di assistenza ed esecuzioni",
    },
  ].filter((t) => t.show);

  if (isLoading) return <HubTabSkeleton />;
  if (!tabs.length) return <AccessDenied />;

  const activeTab = tabs.some((t) => t.id === requestedTab) ? requestedTab : tabs[0].id;

  const handleTabChange = (tab: CSTab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === "assistenza") next.delete("tab");
        else next.set("tab", tab);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-3 pb-20 sm:pb-0">
      <AdminHeroHeader
        icon={HeartHandshake}
        title="Assistenza Clienti"
      />

      <AdminHubTabs<CSTab>
        activeTab={activeTab}
        onChange={handleTabChange}
        ariaLabel="Sezioni assistenza clienti"
        tabs={tabs}
        className="[&>nav]:[scrollbar-width:thin] sm:[&>nav]:[scrollbar-width:none]"
      />

      <section role="tabpanel" id={`hub-panel-${activeTab}`} aria-labelledby={`hub-tab-${activeTab}`}>
        <Suspense fallback={<HubTabSkeleton />}>
          {activeTab === "cockpit" && <CockpitTab />}
          {activeTab === "dashboard" && <AdminCSDashboard />}
          {activeTab === "assistenza" && <GlobalTickets />}
          {activeTab === "lifecycle" && <CompanyLifecycle />}
          {activeTab === "onboarding" && <CustomerSuccess />}
          {activeTab === "playbook" && <PlaybooksPage />}
        </Suspense>
      </section>
    </div>
  );
}

function HubTabSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
