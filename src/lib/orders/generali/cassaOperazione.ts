import { aggiungiMesi } from "./pianoCategorie";
import type { Movimento } from "./investitoriConti";
import type { ForecastMovement } from "@/lib/finance/forecastLedger";
import { movimentoPrevisto } from "./movimentiFonti";

export interface PagamentoEffettivo {
  id: string;
  entry_date: string;
  amount: number;
  direction: string;
  reversal_of: string | null;
  category: string;
  notes: string | null;
}
export interface MeseOperazione {
  mese: string;
  incassato: number;
  pagato: number;
  entrateAttese: number;
  usciteAttese: number;
  versato: number;
  rimborsato: number;
  oneriFinanziari: number;
  capitaleAtteso: number;
  rimborsiAttesi: number;
  finanziariAttesi: number;
}
/** Integer cents; dates are document/payment dates, never invoice issue dates used as payment dates. */
export function cassaOperazione(input: {
  oggi: string;
  registrati: PagamentoEffettivo[];
  previsti: ForecastMovement[];
  movimenti: Movimento[];
  ritardoMesi?: number;
}) {
  const mesi = new Map<string, MeseOperazione>();
  const mese = (data: string) => {
    const k = data.slice(0, 7);
    if (!mesi.has(k))
      mesi.set(k, {
        mese: k,
        incassato: 0,
        pagato: 0,
        entrateAttese: 0,
        usciteAttese: 0,
        versato: 0,
        rimborsato: 0,
        oneriFinanziari: 0,
        capitaleAtteso: 0,
        rimborsiAttesi: 0,
        finanziariAttesi: 0,
      });
    return mesi.get(k)!;
  };
  const annullati = new Set(input.registrati.map((r) => r.reversal_of).filter(Boolean));
  const registrati = [...new Map(input.registrati.map((r) => [r.id, r])).values()].filter(
    (r) => !r.reversal_of && !annullati.has(r.id) && r.entry_date <= input.oggi,
  );
  for (const r of registrati) {
    const m = mese(r.entry_date);
    if (["entrata", "in"].includes(r.direction)) m.incassato += Math.round(Number(r.amount) * 100);
    else m.pagato += Math.round(Number(r.amount) * 100);
  }
  let senzaData = 0,
    daRiconciliare = 0;
  for (const r of [...new Map(input.previsti.map((r) => [r.id, r])).values()]) {
    if (r.possibleDuplicate) {
      daRiconciliare++;
      continue;
    }
    if (!r.date) {
      senzaData++;
      continue;
    }
    const data = r.date < input.oggi ? input.oggi : r.date;
    const k =
      r.direction === "in" && input.ritardoMesi
        ? aggiungiMesi(data.slice(0, 7), input.ritardoMesi)
        : data.slice(0, 7);
    const m = mese(k);
    if (r.direction === "in") m.entrateAttese += r.cents;
    else m.usciteAttese += r.cents;
  }
  // Funding is shown in separate columns: it is never added to revenue or construction cost.
  for (const r of input.movimenti) {
    const futuro = movimentoPrevisto(r, input.oggi);
    const m = mese(futuro && r.data < input.oggi ? input.oggi : r.data),
      n = Math.round(r.importo * 100);
    if (r.tipo === "versamento") {
      if (futuro) m.capitaleAtteso += n;
      else m.versato += n;
    } else if (r.tipo === "rimborso") {
      if (futuro) m.rimborsiAttesi += n;
      else m.rimborsato += n;
    } else if (["interessi", "spese", "distribuzione"].includes(r.tipo)) {
      if (futuro) m.finanziariAttesi += n;
      else m.oneriFinanziari += n;
    }
    // accollo transfers a liability; no money enters or leaves the company's cash.
  }
  const righe = [...mesi.values()].sort((a, b) => a.mese.localeCompare(b.mese));
  let flusso = 0,
    fabbisogno = 0;
  for (const m of righe.filter((m) => m.mese >= input.oggi.slice(0, 7))) {
    flusso += m.entrateAttese - m.usciteAttese;
    fabbisogno = Math.max(fabbisogno, -flusso);
  }
  return { righe, senzaData, daRiconciliare, fabbisogno };
}
