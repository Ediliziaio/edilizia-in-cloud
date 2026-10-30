/**
 * Fatture e scadenze di un ordine d'acquisto, lette come le legge chi paga.
 *
 * Prima la scheda «Contabilità» dell'ODA sommava anche le note di credito
 * (che invece tolgono) e trattava ogni fattura più bassa dell'ordine come
 * un errore («verifica prima di pagare»): con un acconto del 30% è il caso
 * normale, non uno scostamento. Qui:
 *   · fatturato = fatture − note di credito, IVA inclusa come il totale ordine;
 *   · sotto l'ordine → «restano da fatturare», un'informazione;
 *   · sopra l'ordine → l'avviso, perché si sta pagando più dell'ordinato;
 *   · la prossima scadenza viene dalle rate del fornitore (RiBa, rate).
 */
import { eNotaDiCredito } from "@/lib/fatturazione/noteDiCredito";

export interface FatturaOda {
  totale_documento: number | string | null;
  tipo_documento: string | null;
}

export interface RataOda {
  numero: number;
  scadenza: string | null;
  importo: number | string;
  metodo: string | null;
  stato: string;
}

export type StatoFatturazioneOda = "nessuna" | "parziale" | "combacia" | "eccede";

export interface ContabilitaOda {
  fatturato: number;
  stato: StatoFatturazioneOda;
  /** Quanto manca da fatturare (stato «parziale»). */
  residuo: number;
  /** Quanto si è fatturato oltre l'ordine (stato «eccede»). */
  eccedenza: number;
  /** Rate non pagate, dalla più vicina. */
  rateAperte: RataOda[];
  /** Le rate aperte con la stessa scadenza della prossima: escono lo stesso giorno. */
  prossima: { scadenza: string | null; importo: number; rate: RataOda[] } | null;
}

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Tolleranza di un centesimo: gli arrotondamenti dell'IVA non sono scostamenti. */
const TOLLERANZA = 0.01;

export function contabilitaOda(totaleOrdine: number, fatture: FatturaOda[], rate: RataOda[]): ContabilitaOda {
  const fatturato = fatture.reduce((s, f) => {
    const importo = Math.abs(num(f.totale_documento));
    return s + (eNotaDiCredito(f.tipo_documento) ? -importo : importo);
  }, 0);
  const differenza = fatturato - totaleOrdine;

  const stato: StatoFatturazioneOda =
    fatture.length === 0
      ? "nessuna"
      : differenza > TOLLERANZA
        ? "eccede"
        : differenza < -TOLLERANZA
          ? "parziale"
          : "combacia";

  const rateAperte = rate
    .filter((r) => r.stato !== "pagata")
    .sort((a, b) => (a.scadenza ?? "9999").localeCompare(b.scadenza ?? "9999") || a.numero - b.numero);

  const primaScadenza = rateAperte[0]?.scadenza ?? null;
  const diQuelGiorno = rateAperte.length > 0 ? rateAperte.filter((r) => r.scadenza === primaScadenza) : [];

  return {
    fatturato: Math.round(fatturato * 100) / 100,
    stato,
    residuo: stato === "parziale" ? Math.round(-differenza * 100) / 100 : 0,
    eccedenza: stato === "eccede" ? Math.round(differenza * 100) / 100 : 0,
    rateAperte,
    prossima:
      diQuelGiorno.length > 0
        ? {
            scadenza: primaScadenza,
            importo: Math.round(diQuelGiorno.reduce((s, r) => s + num(r.importo), 0) * 100) / 100,
            rate: diQuelGiorno,
          }
        : null,
  };
}
