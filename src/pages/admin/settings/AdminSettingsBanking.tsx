/**
 * Banking — una pagina con due schede (?scheda= nell'URL):
 *   • collegamento (predefinita) → Salt Edge + stato vero della Tesoreria per azienda
 *   • situazione                 → stato delle connessioni Open Banking di tutte le aziende
 *                                   (lo stesso contenuto di /admin/impostazioni/banking-overview)
 */
import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, Landmark } from "lucide-react";
import BankingSettingsTab from "@/components/admin/settings/BankingSettingsTab";
import { AdminHubTabs } from "@/components/admin/AdminHubTabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";

const BankingOverviewPanel = lazy(() =>
  import("@/components/admin/settings/BankingOverviewPanel").then((m) => ({ default: m.BankingOverviewPanel })),
);

type SchedaBanking = "collegamento" | "situazione";

function SituazionePerAzienda() {
  const { permissions } = useSuperAdminPermissions();
  if (!permissions.can_manage_admins) return <AccessDenied />;
  return (
    <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
      <BankingOverviewPanel />
    </Suspense>
  );
}

export default function AdminSettingsBanking() {
  const [searchParams, setSearchParams] = useSearchParams();
  const scheda: SchedaBanking = searchParams.get("scheda") === "situazione" ? "situazione" : "collegamento";
  const cambiaScheda = (prossima: SchedaBanking) =>
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        if (prossima === "collegamento") sp.delete("scheda");
        else sp.set("scheda", prossima);
        return sp;
      },
      { replace: true },
    );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Banking</h1>
        <p className="text-muted-foreground max-sm:hidden">
          Collegamento dei conti correnti (Salt Edge), Tesoreria per azienda e stato delle connessioni bancarie
        </p>
      </div>
      <AdminHubTabs<SchedaBanking>
        activeTab={scheda}
        onChange={cambiaScheda}
        ariaLabel="Sezioni banking"
        tabs={[
          { id: "collegamento", label: "Collegamento", icon: Landmark },
          { id: "situazione", label: "Situazione per azienda", icon: Activity },
        ]}
      />
      {scheda === "collegamento" ? <BankingSettingsTab /> : <SituazionePerAzienda />}
    </div>
  );
}
