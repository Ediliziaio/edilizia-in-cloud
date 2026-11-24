import { Target, Users, Euro, TrendingUp, Percent, Timer } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { KPICard, type ColorKey } from "@/components/reporting/shared/KPICard";
import { variazionePercento, variazionePunti } from "@/lib/reporting/variazioneKpi";
import type { VendorKPI } from "@/hooks/useVendorReport";
import { semaforoVenditori, tassoTesto, giorniTesto, type CampoConSoglia } from "@/lib/reporting/venditoriRegole";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const COLORE: Record<"buono" | "medio" | "critico", ColorKey> = { buono: "green", medio: "yellow", critico: "red" };

/** Colore della scheda dalle soglie comuni del report; blu quando il numero non c'è. */
function colore(campo: CampoConSoglia, valore: number | null | undefined): ColorKey {
  const s = semaforoVenditori(campo, valore);
  return s ? COLORE[s] : "blue";
}

// Le frasi della variazione (variazionePunti / variazionePercento) sono comuni
// col report Call center: stanno in lib/reporting/variazioneKpi.
interface Props {
  kpi: VendorKPI | null;
  isLoading: boolean;
  /** Stessi numeri sul periodo di confronto (vedi periodoPrecedente). */
  precedente?: VendorKPI | null;
  /** Le date del periodo di confronto, per dire a cosa si riferiscono le frecce. */
  etichettaPrecedente?: string;
}

export function KPISection({ kpi, isLoading, precedente, etichettaPrecedente }: Props) {
  const t = useT();
  if (!kpi && !isLoading) {
    return (
      <div className="text-center py-10 max-sm:py-4">
        <p className="text-muted-foreground">{t("Nessun dato disponibile per il periodo selezionato.")}</p>
        <p className="text-sm text-muted-foreground/70 mt-1 max-sm:hidden">{t("Verifica che le Opportunità abbiano l'agente assegnato.")}</p>
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
      title: t("Tasso di Chiusura"),
      value: tassoTesto(kpi?.tasso_chiusura),
      subtitle: t("{vinte} vinte su {chiuse} chiuse (le scartate non contano)", { vinte: kpi?.opp_vinte ?? 0, chiuse: (kpi?.opp_vinte ?? 0) + (kpi?.opp_perse ?? 0) }),
      icon: Target,
      colorKey: colore("tasso_chiusura", kpi?.tasso_chiusura),
      benchmark: t("25–45% settore edile"),
      variazione: variazionePunti(kpi?.tasso_chiusura, p?.tasso_chiusura),
    },
    {
      title: t("Show-Up Rate"),
      value: tassoTesto(kpi?.tasso_show_up),
      subtitle: t("{effettuati} effettuati, {noShow} no-show su {fissati} fissati", { effettuati, noShow, fissati }),
      icon: Users,
      colorKey: colore("tasso_show_up", kpi?.tasso_show_up),
      benchmark: fissati > 0 ? t(">70% ottimo · conta solo gli appuntamenti con un esito") : t("Nessun appuntamento nel periodo"),
      variazione: variazionePunti(kpi?.tasso_show_up, p?.tasso_show_up),
    },
    {
      title: t("Fatturato Generato"),
      // 15/11/2026: senza vendite vinte «—», come il tasso di chiusura accanto (0,00 € sembrava un dato).
      value: (kpi?.opp_vinte ?? 0) > 0 ? formatCurrency(kpi?.fatturato_generato ?? 0) : "—",
      // Non è il «Ricavo firmato» di Sales OS, che conta i preventivi firmati.
      subtitle: t("Valore delle opportunità vinte · pipeline aperta oggi {valore}", { valore: formatCurrency(kpi?.pipeline_valore ?? 0) }),
      icon: Euro,
      colorKey: "blue" as ColorKey,
      variazione: variazionePercento(kpi?.fatturato_generato, p?.fatturato_generato),
    },
    {
      title: t("Importo Medio Chiusura"),
      value: (kpi?.opp_vinte ?? 0) > 0 ? formatCurrency(kpi?.importo_medio_chiusura ?? 0) : "—",
      subtitle: t("Su {n} opportunità vinte", { n: kpi?.opp_vinte ?? 0 }),
      icon: TrendingUp,
      colorKey: "blue" as ColorKey,
      variazione: (kpi?.opp_vinte ?? 0) > 0 && (p?.opp_vinte ?? 0) > 0
        ? variazionePercento(kpi?.importo_medio_chiusura, p?.importo_medio_chiusura)
        : null,
    },
    {
      title: t("App → Chiusura"),
      value: tassoTesto(kpi?.tasso_app_to_close),
      subtitle: effettuati > 0
        ? t("Degli appuntamenti effettuati, {tasso_app_to_close} ha un'opportunità vinta", { tasso_app_to_close: tassoTesto(kpi?.tasso_app_to_close) })
        : t("Nessun appuntamento effettuato"),
      icon: Percent,
      colorKey: colore("tasso_app_to_close", kpi?.tasso_app_to_close),
      benchmark: effettuati > 0 ? t(">25% eccellente") : undefined,
      variazione: variazionePunti(kpi?.tasso_app_to_close, p?.tasso_app_to_close),
    },
    {
      title: t("Ciclo Vendita Medio"),
      value: giorniTesto(ciclo, vinte > 0),
      subtitle: vinte > 0
        ? t("Min {min_giorni_chiusura} — Max {max_giorni_chiusura}, dalla creazione alla vittoria", { min_giorni_chiusura: giorniTesto(kpi?.min_giorni_chiusura, true), max_giorni_chiusura: giorniTesto(kpi?.max_giorni_chiusura, true) })
        : t("Nessuna vendita nel periodo"),
      icon: Timer,
      colorKey: vinte > 0 ? colore("avg_giorni_chiusura", Math.max(ciclo, 0.1)) : "blue" as ColorKey,
      benchmark: t("<30gg ottimo, <60gg ok"),
      variazione: vinte > 0 && (p?.opp_vinte ?? 0) > 0
        ? variazionePercento(ciclo, p?.avg_giorni_chiusura, true)
        : null,
    },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-sm:grid-cols-2 max-sm:gap-2">
        {cards.map(card => (
          <KPICard key={card.title} {...card} isLoading={isLoading} />
        ))}
      </div>
      {p && etichettaPrecedente && !isLoading && (
        <p className="text-xs text-muted-foreground max-sm:hidden">{t("Le frecce confrontano con {etichettaPrecedente}.", { etichettaPrecedente })}</p>
      )}
    </div>
  );
}
