import { Target, Users, Euro, TrendingUp, Percent, Timer } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { KPICard, type ColorKey } from "@/components/reporting/shared/KPICard";
import type { VendorKPI } from "@/hooks/useVendorReport";
import { semaforoVenditori, tassoTesto, giorniTesto, type CampoConSoglia } from "@/lib/reporting/venditoriRegole";

const COLORE: Record<"buono" | "medio" | "critico", ColorKey> = { buono: "green", medio: "yellow", critico: "red" };

/** Colore della scheda dalle soglie comuni del report; blu quando il numero non c'è. */
function colore(campo: CampoConSoglia, valore: number | null | undefined): ColorKey {
  const s = semaforoVenditori(campo, valore);
  return s ? COLORE[s] : "blue";
}

type Variazione = { testo: string; buona: boolean | null } | null;

/** Differenza in punti percentuali tra due tassi. */
function variazionePunti(ora: number | null | undefined, prima: number | null | undefined): Variazione {
  if (ora == null || prima == null) return null;
  const d = Math.round((ora - prima) * 10) / 10;
  if (d === 0) return { testo: "= periodo precedente", buona: null };
  return { testo: `${d > 0 ? "▲ +" : "▼ "}${d.toLocaleString("it-IT")} pt vs periodo precedente`, buona: d > 0 };
}

/** Variazione percentuale di un importo; meglioSeMinore per il ciclo di vendita. */
function variazionePercento(ora: number | null | undefined, prima: number | null | undefined, meglioSeMinore = false): Variazione {
  if (ora == null || prima == null) return null;
  if (prima === 0) return ora > 0 ? { testo: "nuovo rispetto al periodo precedente", buona: !meglioSeMinore } : null;
  const d = Math.round(((ora - prima) / prima) * 100);
  if (d === 0) return { testo: "= periodo precedente", buona: null };
  return { testo: `${d > 0 ? "▲ +" : "▼ "}${d}% vs periodo precedente`, buona: meglioSeMinore ? d < 0 : d > 0 };
}

interface Props {
  kpi: VendorKPI | null;
  isLoading: boolean;
  /** Stessi numeri sul periodo di confronto (vedi periodoPrecedente). */
  precedente?: VendorKPI | null;
  /** Le date del periodo di confronto, per dire a cosa si riferiscono le frecce. */
  etichettaPrecedente?: string;
}

export function KPISection({ kpi, isLoading, precedente, etichettaPrecedente }: Props) {
  if (!kpi && !isLoading) {
    return (
      <div className="text-center py-10">
        <p className="text-muted-foreground">Nessun dato disponibile per il periodo selezionato.</p>
        <p className="text-sm text-muted-foreground/70 mt-1">Verifica che le Opportunità abbiano l'agente assegnato.</p>
      </div>
    );
  }

  const fissati = kpi?.appuntamenti_fissati ?? 0;
  const effettuati = kpi?.appuntamenti_effettuati ?? 0;
  const noShow = kpi?.appuntamenti_no_show ?? 0;
  const p = precedente ?? null;
  const ciclo = kpi?.avg_giorni_chiusura ?? 0;
  const vinte = kpi?.opp_vinte ?? 0;

  const cards = [
    {
      title: "Tasso di Chiusura",
      value: tassoTesto(kpi?.tasso_chiusura),
      subtitle: `${kpi?.opp_vinte ?? 0} vinte su ${(kpi?.opp_vinte ?? 0) + (kpi?.opp_perse ?? 0)} chiuse (le scartate non contano)`,
      icon: Target,
      colorKey: colore("tasso_chiusura", kpi?.tasso_chiusura),
      benchmark: "25–45% settore edile",
      variazione: variazionePunti(kpi?.tasso_chiusura, p?.tasso_chiusura),
    },
    {
      title: "Show-Up Rate",
      value: tassoTesto(kpi?.tasso_show_up),
      subtitle: `${effettuati} effettuati, ${noShow} no-show su ${fissati} fissati`,
      icon: Users,
      colorKey: colore("tasso_show_up", kpi?.tasso_show_up),
      benchmark: fissati > 0 ? ">70% ottimo · conta solo gli appuntamenti con un esito" : "Nessun appuntamento nel periodo",
      variazione: variazionePunti(kpi?.tasso_show_up, p?.tasso_show_up),
    },
    {
      title: "Fatturato Generato",
      value: formatCurrency(kpi?.fatturato_generato ?? 0),
      // Non è il «Ricavo firmato» di Sales OS, che conta i preventivi firmati.
      subtitle: `Valore delle opportunità vinte · pipeline aperta oggi ${formatCurrency(kpi?.pipeline_valore ?? 0)}`,
      icon: Euro,
      colorKey: "blue" as ColorKey,
      variazione: variazionePercento(kpi?.fatturato_generato, p?.fatturato_generato),
    },
    {
      title: "Importo Medio Chiusura",
      value: formatCurrency(kpi?.importo_medio_chiusura ?? 0),
      subtitle: `Su ${kpi?.opp_vinte ?? 0} opportunità vinte`,
      icon: TrendingUp,
      colorKey: "blue" as ColorKey,
      variazione: (kpi?.opp_vinte ?? 0) > 0 && (p?.opp_vinte ?? 0) > 0
        ? variazionePercento(kpi?.importo_medio_chiusura, p?.importo_medio_chiusura)
        : null,
    },
    {
      title: "App → Chiusura",
      value: tassoTesto(kpi?.tasso_app_to_close),
      subtitle: effettuati > 0
        ? `Degli appuntamenti effettuati, ${tassoTesto(kpi?.tasso_app_to_close)} ha un'opportunità vinta`
        : "Nessun appuntamento effettuato",
      icon: Percent,
      colorKey: colore("tasso_app_to_close", kpi?.tasso_app_to_close),
      benchmark: effettuati > 0 ? ">25% eccellente" : undefined,
      variazione: variazionePunti(kpi?.tasso_app_to_close, p?.tasso_app_to_close),
    },
    {
      title: "Ciclo Vendita Medio",
      value: giorniTesto(ciclo, vinte > 0),
      subtitle: vinte > 0
        ? `Min ${giorniTesto(kpi?.min_giorni_chiusura, true)} — Max ${giorniTesto(kpi?.max_giorni_chiusura, true)}, dalla creazione alla vittoria`
        : "Nessuna vendita nel periodo",
      icon: Timer,
      colorKey: vinte > 0 ? colore("avg_giorni_chiusura", Math.max(ciclo, 0.1)) : "blue" as ColorKey,
      benchmark: "<30gg ottimo, <60gg ok",
      variazione: vinte > 0 && (p?.opp_vinte ?? 0) > 0
        ? variazionePercento(ciclo, p?.avg_giorni_chiusura, true)
        : null,
    },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(card => (
          <KPICard key={card.title} {...card} isLoading={isLoading} />
        ))}
      </div>
      {p && etichettaPrecedente && !isLoading && (
        <p className="text-xs text-muted-foreground">
          Le frecce confrontano con {etichettaPrecedente}.
        </p>
      )}
    </div>
  );
}
