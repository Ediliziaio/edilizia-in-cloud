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
    .filter((r) => r.stato !== "pagata" && r.stato !== "stornata")
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

/** Una riga d'ordine per il confronto col consegnato. */
export interface RigaOdaConsegna {
  quantity: number | string | null;
  quantity_received: number | string | null;
  line_total?: number | string | null;
  unit_price?: number | string | null;
  discount_percent?: number | string | null;
  vat_rate?: number | string | null;
  price_pending?: boolean | null;
}

export interface ConsegnatoFatturato {
  /** Valore della merce arrivata, IVA inclusa come il fatturato (prezzo netto dell'ordine × quantità ricevuta). */
  consegnato: number;
  /** Arrivato e non ancora fatturato. */
  daFatturare: number;
  /** Fatturato più dell'arrivato: fattura prima della consegna, o merce non ancora registrata. */
  fatturatoNonConsegnato: number;
  /** Righe senza prezzo (prezzo da definire): il valore del consegnato non è completo. */
  righeSenzaPrezzo: number;
}

/**
 * Consegnato contro fatturato (§7.7, docs/automazioni-acquisti.md). Le fatture sono agganciate
 * all'ordine intero, non alle righe: il confronto onesto è a valore, IVA inclusa come `fatturato`.
 * Una somma, non una sequenza: vale con i documenti in qualunque ordine siano arrivati.
 */
export function consegnatoFatturatoOda(righe: RigaOdaConsegna[], fatturato: number): ConsegnatoFatturato {
  let consegnato = 0;
  let righeSenzaPrezzo = 0;
  for (const r of righe) {
    const q = num(r.quantity);
    const ricevuta = num(r.quantity_received);
    if (ricevuta <= 0) continue;
    const totale = r.line_total != null ? num(r.line_total) : null;
    const netto = r.price_pending
      ? null
      : totale != null && q > 0
        ? totale / q
        : r.unit_price != null
          ? num(r.unit_price) * (1 - num(r.discount_percent) / 100)
          : null;
    if (netto == null) {
      righeSenzaPrezzo++;
      continue;
    }
    consegnato += netto * ricevuta * (1 + num(r.vat_rate) / 100);
  }
  const c = Math.round(consegnato * 100) / 100;
  const diff = Math.round((fatturato - c) * 100) / 100;
  return {
    consegnato: c,
    daFatturare: diff < -TOLLERANZA ? -diff : 0,
    fatturatoNonConsegnato: diff > TOLLERANZA ? diff : 0,
    righeSenzaPrezzo,
  };
}
