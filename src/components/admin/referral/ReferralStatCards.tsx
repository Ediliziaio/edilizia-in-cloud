import { Users, Building2, TrendingUp, Wallet } from "lucide-react";
import { RigaRiepilogo } from "@/components/admin/fatturato/AreaUI";
import { formatCurrency } from "@/lib/formatters";
import type { Referrer, ReferralCompany } from "@/pages/admin/ReferralDashboard";

interface Props {
  referrers: Referrer[];
  referralCompanies: ReferralCompany[];
  getMonthlyCommission: (r: Referrer) => number;
}

export function ReferralStatCards({ referrers, referralCompanies, getMonthlyCommission }: Props) {
  const activeReferrers = referrers.filter((r) => r.is_active).length;
  const totalCompanies = referralCompanies.length;
  const monthlyTotal = referrers.filter(r => r.is_active).reduce((sum, r) => sum + getMonthlyCommission(r), 0);
  const totalPaid = referrers.reduce((sum, r) => sum + r.total_paid, 0);
  // "Da pagare" PER-PARTNER: Σ max(0, earned−paid). Prima era Σearned−Σpaid
  // aggregato, dove un partner sovra-pagato mascherava il debito verso un altro
  // → importo diverso da quello mostrato in Panoramica. Ora coincidono.
  const toPay = referrers.reduce((sum, r) => sum + Math.max(0, r.total_earned - r.total_paid), 0);

  // Stessa riga di riepilogo delle altre pagine dell'area: due card per riga
  // da telefono, quattro su schermo largo.
  return (
    <RigaRiepilogo
      voci={[
        { etichetta: "Partner attivi", icona: Users, valore: activeReferrers, dettaglio: `${referrers.length} in tutto` },
        { etichetta: "Aziende portate", icona: Building2, valore: totalCompanies, dettaglio: "registrazioni totali" },
        { etichetta: "Commissioni del mese", icona: TrendingUp, valore: formatCurrency(monthlyTotal), dettaglio: "stima sul listino" },
        {
          etichetta: "Da pagare",
          icona: Wallet,
          valore: formatCurrency(toPay > 0 ? toPay : 0),
          dettaglio: `${formatCurrency(totalPaid)} già pagati`,
          tono: toPay > 0 ? "attenzione" : "neutro",
        },
      ]}
    />
  );
}
