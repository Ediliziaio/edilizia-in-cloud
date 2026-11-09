// Gating gestito da withCompanyPermission("canViewSettingsOrders") in companyRoutes.tsx
import RegoleCampoConfig from "@/components/settings/RegoleCampoConfig";
import VociRapportinoConfig from "@/components/settings/VociRapportinoConfig";

export default function SettingsRapportiniCantiere() {
  return (
    <div className="space-y-4">
      <RegoleCampoConfig />
      <div id="voci-rapportino" className="scroll-mt-24"><VociRapportinoConfig /></div>
    </div>
  );
}
