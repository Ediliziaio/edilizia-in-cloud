/**
 * I dati del Conto Termico salvati sul preventivo termoidraulico
 * (idr_progetti.conto_termico): cosa si toglie, cosa si installa, il
 * contributo scritto a mano e le spese per il conto del risparmio.
 */
import { INTERVENTI_CONTO_TERMICO, type InterventoContoTermico, type ModalitaContributo } from "./regole";
import type { ContoTermicoEconomia } from "./calcoli";

export interface DatiContoTermico {
  tipo: InterventoContoTermico;
  /** Cosa si installa: «Pompa di calore aria-acqua 8 kW». */
  titolo: string;
  /** Cosa si toglie: «Caldaia a gas del 2008». */
  impianto_attuale: string;
  potenza_kw: number | null;
  /** Contributo GSE stimato, IVA non c'entra: è quello del simulatore del GSE. */
  contributo: number;
  modalita: ModalitaContributo;
  spesa_annua_attuale: number;
  spesa_annua_nuova: number;
  aumento_energia_pct: number;
  anni: number;
  /** Il confronto con la detrazione (50 o 36); null = pagina senza confronto. */
  detrazione_confronto: number | null;
  caratteristiche: { etichetta: string; valore: string }[];
}

export const DATI_CONTO_TERMICO_INIZIALI: DatiContoTermico = {
  tipo: "pompa_calore",
  titolo: "Pompa di calore aria-acqua",
  impianto_attuale: "Caldaia a gas",
  potenza_kw: null,
  contributo: 0,
  modalita: "sconto_in_fattura",
  spesa_annua_attuale: 0,
  spesa_annua_nuova: 0,
  aumento_energia_pct: 2,
  anni: 15,
  detrazione_confronto: 50,
  caratteristiche: [],
};

const numero = (v: unknown, riserva: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : riserva;
};
const testo = (v: unknown, riserva: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 160) : riserva);

/** Dal jsonb salvato ai dati completi: ciò che manca prende il valore di partenza. */
export function leggiDatiContoTermico(raw: unknown): DatiContoTermico {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DATI_CONTO_TERMICO_INIZIALI;
  const tipo = typeof r.tipo === "string" && r.tipo in INTERVENTI_CONTO_TERMICO ? r.tipo as InterventoContoTermico : d.tipo;
  const potenza = numero(r.potenza_kw, NaN);
  const detrazione = r.detrazione_confronto === null ? null : numero(r.detrazione_confronto, d.detrazione_confronto ?? 50);
  const caratteristiche = Array.isArray(r.caratteristiche)
    ? r.caratteristiche
        .map((x) => (x && typeof x === "object" ? x as Record<string, unknown> : {}))
        .map((x) => ({ etichetta: testo(x.etichetta, ""), valore: testo(x.valore, "") }))
        .filter((x) => x.etichetta && x.valore)
        .slice(0, 9)
    : [];
  return {
    tipo,
    // Senza titolo: quello di partenza per la pompa di calore, il nome dell'intervento per gli altri.
    titolo: testo(r.titolo, tipo === d.tipo ? d.titolo : INTERVENTI_CONTO_TERMICO[tipo]),
    impianto_attuale: testo(r.impianto_attuale, d.impianto_attuale),
    potenza_kw: Number.isFinite(potenza) && potenza > 0 ? potenza : null,
    contributo: Math.max(0, numero(r.contributo, 0)),
    modalita: r.modalita === "rimborso" ? "rimborso" : "sconto_in_fattura",
    spesa_annua_attuale: Math.max(0, numero(r.spesa_annua_attuale, 0)),
    spesa_annua_nuova: Math.max(0, numero(r.spesa_annua_nuova, 0)),
    aumento_energia_pct: Math.min(10, Math.max(0, numero(r.aumento_energia_pct, d.aumento_energia_pct))),
    anni: Math.min(30, Math.max(5, Math.round(numero(r.anni, d.anni)))),
    detrazione_confronto: detrazione === null || detrazione <= 0 ? null : Math.min(100, detrazione),
    caratteristiche,
  };
}

/** Dati del preventivo + prezzo finale (IVA inclusa) → i numeri per i conti. */
export function economiaContoTermico(dati: DatiContoTermico, prezzoIvaInclusa: number, ivaPct: number): ContoTermicoEconomia {
  return {
    prezzoIvaInclusa,
    ivaPct,
    contributo: dati.contributo,
    modalita: dati.modalita,
    potenzaKw: dati.potenza_kw,
    spesaAnnuaAttuale: dati.spesa_annua_attuale,
    spesaAnnuaNuova: dati.spesa_annua_nuova,
    aumentoEnergiaPct: dati.aumento_energia_pct,
    anni: dati.anni,
    detrazionePct: dati.detrazione_confronto,
  };
}
