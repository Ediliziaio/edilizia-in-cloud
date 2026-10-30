/**
 * Info Piattaforma — quattro schede, con la scheda attiva nell'URL (?scheda=):
 *   generale (predefinita) · branding · analytics · richiamo
 */
import { useSearchParams } from "react-router-dom";
import PlatformInfoTab from "@/components/admin/settings/PlatformInfoTab";
import { PlatformBrandingTab } from "@/components/admin/settings/PlatformBrandingTab";
import { PlatformAnalyticsTab } from "@/components/admin/settings/PlatformAnalyticsTab";
import { RichiamoACaldoTab } from "@/components/admin/settings/RichiamoACaldoTab";
import { AdminHubTabs } from "@/components/admin/AdminHubTabs";
import { Server, Palette, ChartBar, PhoneOutgoing } from "lucide-react";

type SchedaPiattaforma = "generale" | "branding" | "analytics" | "richiamo";
const SCHEDE: readonly SchedaPiattaforma[] = ["generale", "branding", "analytics", "richiamo"];

export default function AdminSettingsPlatform() {
  const [searchParams, setSearchParams] = useSearchParams();
  const richiesta = searchParams.get("scheda");
  const scheda: SchedaPiattaforma = SCHEDE.includes(richiesta as SchedaPiattaforma)
    ? (richiesta as SchedaPiattaforma)
    : "generale";
  const cambiaScheda = (prossima: SchedaPiattaforma) =>
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        if (prossima === "generale") sp.delete("scheda");
        else sp.set("scheda", prossima);
        return sp;
      },
      { replace: true },
    );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Info Piattaforma</h1>
        <p className="text-muted-foreground max-sm:hidden">
          Numeri, manutenzione e stato dei servizi, branding e SEO, analytics, richiamo a caldo
        </p>
      </div>

      <AdminHubTabs<SchedaPiattaforma>
        activeTab={scheda}
        onChange={cambiaScheda}
        ariaLabel="Sezioni info piattaforma"
        tabs={[
          { id: "generale", label: "Generale", icon: Server },
          { id: "branding", label: "Branding e SEO", icon: Palette },
          { id: "analytics", label: "Analytics", icon: ChartBar },
          { id: "richiamo", label: "Richiamo a caldo", icon: PhoneOutgoing },
        ]}
      />

      {scheda === "generale" && <PlatformInfoTab />}
      {scheda === "branding" && <PlatformBrandingTab />}
      {scheda === "analytics" && <PlatformAnalyticsTab />}
      {scheda === "richiamo" && <RichiamoACaldoTab />}
    </div>
  );
}
