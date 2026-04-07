/**
 * CohortPage — Pagina standalone per la visualizzazione
 * della cohort retention matrix e del grafico churn mensile.
 */
import { CohortChart } from "@/components/admin/CohortChart";

export default function CohortPage() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analisi Cohort</h1>
        <p className="text-muted-foreground text-sm">
          Retention per cohort mensile e churn storico
        </p>
      </div>
      <CohortChart />
    </div>
  );
}
