import CompanyCostsManager from "@/components/forecast/CompanyCostsManager";
import { TrendingDown } from "lucide-react";

export default function CompanyCosts() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
            <TrendingDown className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Costi Aziendali</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Gestisci costi fissi, variabili, fornitori, scadenze e marginalità.
            </p>
          </div>
        </div>
      </div>
      <CompanyCostsManager />
    </div>
  );
}
