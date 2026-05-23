import { Target, Users, Euro, TrendingUp, Percent, Timer } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { KPICard, type ColorKey } from "@/components/reporting/shared/KPICard";
import type { VendorKPI } from "@/hooks/useVendorReport";

function getColor(field: string, val: number): ColorKey {
  if (field === "avg_giorni_chiusura") {
    return val <= 0 ? "blue" : val < 30 ? "green" : val < 60 ? "yellow" : "red";
  }
  const thresholds: Record<string, [number, number]> = {
    tasso_chiusura: [35, 20],
    tasso_show_up: [70, 50],
    tasso_app_to_close: [25, 12],
  };
  const [hi, lo] = thresholds[field] ?? [100, 0];
  return val >= hi ? "green" : val >= lo ? "yellow" : "red";
}

interface Props { kpi: VendorKPI | null; isLoading: boolean; }

export function KPISection({ kpi, isLoading }: Props) {
  if (!kpi && !isLoading) {
    return (
      <div className="text-center py-10">
        <p className="text-muted-foreground">Nessun dato disponibile per il periodo selezionato.</p>
        <p className="text-sm text-muted-foreground/70 mt-1">Verifica che le Opportunità abbiano l'agente assegnato.</p>
      </div>
    );
  }

  const appuntamentiFissati = kpi?.appuntamenti_fissati ?? 0;
  const appuntamentiEffettuati = kpi?.appuntamenti_effettuati ?? 0;

  const cards = [
    { title: "Tasso di Chiusura", value: `${kpi?.tasso_chiusura ?? 0}%`, subtitle: `${kpi?.opp_vinte ?? 0} vinte su ${(kpi?.opp_vinte ?? 0) + (kpi?.opp_perse ?? 0)} chiuse`, icon: Target, colorKey: getColor("tasso_chiusura", kpi?.tasso_chiusura ?? 0), benchmark: "25–45% settore edile" },
    { title: "Show-Up Rate", value: `${kpi?.tasso_show_up ?? 0}%`, subtitle: `${appuntamentiEffettuati} / ${appuntamentiFissati} appuntamenti`, icon: Users, colorKey: appuntamentiFissati > 0 ? getColor("tasso_show_up", kpi?.tasso_show_up ?? 0) : "blue" as ColorKey, benchmark: appuntamentiFissati > 0 ? ">70% ottimo" : "Nessun appuntamento nel periodo" },
    { title: "Fatturato Generato", value: formatCurrency(kpi?.fatturato_generato ?? 0), subtitle: `Pipeline: ${formatCurrency(kpi?.pipeline_valore ?? 0)}`, icon: Euro, colorKey: "blue" as ColorKey },
    { title: "Importo Medio Chiusura", value: formatCurrency(kpi?.importo_medio_chiusura ?? 0), subtitle: `Su ${kpi?.opp_vinte ?? 0} opportunità vinte`, icon: TrendingUp, colorKey: "blue" as ColorKey },
    { title: "App → Chiusura", value: `${kpi?.tasso_app_to_close ?? 0}%`, subtitle: `Ogni 100 app effettuati → ${kpi?.tasso_app_to_close ?? 0} chiuse`, icon: Percent, colorKey: appuntamentiEffettuati > 0 ? getColor("tasso_app_to_close", kpi?.tasso_app_to_close ?? 0) : "blue" as ColorKey, benchmark: appuntamentiEffettuati > 0 ? ">25% eccellente" : "Nessun appuntamento effettuato" },
    { title: "Ciclo Vendita Medio", value: `${kpi?.avg_giorni_chiusura ?? 0}gg`, subtitle: `Min ${kpi?.min_giorni_chiusura ?? 0}gg — Max ${kpi?.max_giorni_chiusura ?? 0}gg`, icon: Timer, colorKey: getColor("avg_giorni_chiusura", kpi?.avg_giorni_chiusura ?? 0), benchmark: "<30gg ottimo, <60gg ok" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map(card => (
        <KPICard key={card.title} {...card} isLoading={isLoading} />
      ))}
    </div>
  );
}
