/**
 * Banco di prova delle letture AI (17/11/2026): quanto sbaglia l'AI, in numeri.
 *
 * Per ogni documento vero si scrive a mano il risultato giusto (`atteso`, chiavi piatte come
 * "importo" o "rata.2"); la lettura dell'AI (`letto`) si riduce alle stesse chiavi e si confronta
 * campo per campo. Così ogni cambio di modello o di istruzioni si misura invece di andare a
 * sensazione. I documenti stanno fuori dal repository (work/banco-ai/, ignorato da git): sono dei
 * clienti. Qui solo il confronto, senza AI e senza rete.
 */
import type { ContractExtract } from "@/lib/orders/contractExtract";

export type Valore = string | number | null;
export type Esito = "giusto" | "sbagliato" | "mancante" | "inventato";

export interface CampoBanco { chiave: string; atteso: Valore; letto: Valore; esito: Esito }
export interface Punteggio { giusti: number; totale: number; percentuale: number; perEsito: Record<Esito, number> }

/** La lettura del contratto ridotta alle chiavi del banco. */
export function chiaviContratto(e: ContractExtract): Record<string, Valore> {
  const r: Record<string, Valore> = {
    "cliente.nome": e.cliente.nome_completo || null,
    "cliente.piva": e.cliente.partita_iva?.replace(/^IT/i, "") || null,
    "cliente.cf": e.cliente.codice_fiscale?.toUpperCase() || null,
    importo: e.importo_totale_eur,
    iva: e.iva_pct,
    ivato: e.importo_totale_ivato_eur,
    data_documento: e.data_documento?.slice(0, 10) || null,
    inizio: e.data_inizio_lavori?.slice(0, 10) || null,
    fine: e.data_fine_lavori?.slice(0, 10) || null,
    "rate.numero": e.fasi_pagamento.length || null,
  };
  e.fasi_pagamento.forEach((f, i) => {
    r[`rata.${i + 1}`] = f.importo_eur ?? null;
    if (f.percentuale != null) r[`rata.${i + 1}.pct`] = f.percentuale;
  });
  return r;
}

const testo = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function uguali(a: Valore, b: Valore): boolean {
  if (typeof a === "number" || typeof b === "number") {
    const x = Number(a), y = Number(b);
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 0.011;
  }
  const s = testo(String(a)), t = testo(String(b));
  // Un nome scritto più lungo («Mario Rossi» / «Rossi Mario geom.») vale se le parole dell'atteso ci sono tutte.
  return s === t || s.split(" ").every((p) => t.split(" ").includes(p));
}

/**
 * Il confronto. Si contano le chiavi dell'atteso: un campo che il documento non ha va scritto
 * `null` nell'atteso, e se l'AI lo riempie è «inventato». Le chiavi lette che l'atteso non
 * nomina non contano (l'atteso decide cosa si misura).
 */
export function confronta(atteso: Record<string, Valore>, letto: Record<string, Valore>): CampoBanco[] {
  return Object.keys(atteso).map((chiave) => {
    const a = atteso[chiave] ?? null;
    const l = letto[chiave] ?? null;
    const esito: Esito = a == null ? (l == null ? "giusto" : "inventato")
      : l == null ? "mancante"
      : uguali(a, l) ? "giusto" : "sbagliato";
    return { chiave, atteso: a, letto: l, esito };
  });
}

export function punteggio(campi: CampoBanco[]): Punteggio {
  const perEsito: Record<Esito, number> = { giusto: 0, sbagliato: 0, mancante: 0, inventato: 0 };
  for (const c of campi) perEsito[c.esito] += 1;
  const totale = campi.length;
  return { giusti: perEsito.giusto, totale, percentuale: totale ? Math.round((perEsito.giusto / totale) * 1000) / 10 : 0, perEsito };
}
