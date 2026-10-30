/**
 * CohortPage — Pagina standalone per la visualizzazione
 * della cohort retention matrix e del grafico churn mensile.
 */
import { Users } from "lucide-react";
import { CohortChart } from "@/components/admin/CohortChart";
import { IntestazioneArea } from "@/components/admin/fatturato/AreaUI";

export default function CohortPage() {
  return (
    // Niente p-6: il padding lo dà già il <main> del layout admin.
    <div className="space-y-4">
      <IntestazioneArea
        icona={Users}
        titolo="Analisi cohort"
        spiegazione="Quante aziende restano, mese dopo mese, per mese di arrivo; e quante se ne vanno."
      />
      <CohortChart />
    </div>
  );
}
