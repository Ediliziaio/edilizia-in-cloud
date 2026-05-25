/**
 * AdminSettingsSuperAdmins — Hub gestione utenti piattaforma
 *
 * 2 tab:
 *   • team          → Team interno superadmin + permission editor
 *   • multi-company → Utenti consulenti/partner con accesso multi-azienda
 *
 * Stato tab persisted in URL via ?tab=... per:
 *   - share link diretto su una tab specifica
 *   - browser back/forward funzionante
 *   - coerenza UX con tutti gli altri hub admin (Fatturato, CS, AI, Operazioni)
 */
import { useSearchParams } from "react-router-dom";
import { Users, Building, Shield } from "lucide-react";
import PlatformTeamTab from "@/components/admin/settings/PlatformTeamTab";
import MultiCompanyUsersTab from "@/components/admin/settings/MultiCompanyUsersTab";
import { AdminHeroHeader } from "@/components/admin/AdminHeroHeader";
import { AdminHubTabs, type AdminHubTab } from "@/components/admin/AdminHubTabs";

type TeamTab = "team" | "multi-company";
const VALID_TABS: readonly TeamTab[] = ["team", "multi-company"];

function isValidTab(value: string | null): value is TeamTab {
  return value != null && (VALID_TABS as readonly string[]).includes(value);
}

export default function AdminSettingsSuperAdmins() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TeamTab = isValidTab(tabParam) ? tabParam : "team";

  const handleTabChange = (next: TeamTab) => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        if (next === "team") sp.delete("tab");
        else sp.set("tab", next);
        return sp;
      },
      { replace: true },
    );
  };

  const tabs = [
    {
      id: "team" as const,
      label: "Team Piattaforma",
      icon: Users,
      description: "Super Admin e staff interno",
    },
    {
      id: "multi-company" as const,
      label: "Multi-Azienda",
      icon: Building,
      description: "Consulenti con accesso a più aziende",
    },
  ];

  return (
    <div className="space-y-4 pb-20 sm:space-y-6 sm:pb-0">
      <AdminHeroHeader
        icon={Shield}
        title="Gestione Utenti Piattaforma"
        subtitle="Team interno e utenti multi-azienda in un'unica vista."
      />

      {/* Tab navigation in alto — stesso pattern degli hub admin */}
      <AdminHubTabs<TeamTab>
        activeTab={activeTab}
        onChange={handleTabChange}
        ariaLabel="Sezioni gestione utenti piattaforma"
        tabs={tabs as AdminHubTab<TeamTab>[]}
      />

      {activeTab === "team" && <PlatformTeamTab />}
      {activeTab === "multi-company" && <MultiCompanyUsersTab />}
    </div>
  );
}
