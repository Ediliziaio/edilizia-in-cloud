/**
 * Le righe di una bolla mentre la persona le corregge o le scrive a mano (12/11/2026).
 * Una sola logica per tutte le finestre: «Nuovo DDT», «Carica più bolle», il telefono.
 * Prima c'erano due copie (CorreggiRigheBolla e il campo righe del Nuovo DDT) che si
 * comportavano in modo diverso: una toglieva l'abbinamento all'ordine, l'altra no.
 */
import type { DDTRigaNuova } from "@/hooks/useDDTRicezione";
import { importoRiga } from "@/lib/ddt/letturaAI";

export function rigaBollaVuota(posizione: number): DDTRigaNuova {
  return {
    posizione,
    descrizione: "",
    codice_articolo: null,
    unita_misura: null,
    quantita: null,
    prezzo_unitario: null,
    importo: null,
    iva_percentuale: null,
    order_item_id: null,
    origine: "manuale",
    ai_originale: null,
    testo_grezzo: null,
    note: null,
  };
}

/**
 * Una riga toccata a mano: l'abbinamento all'ordine non vale più (la persona lo
 * riguarda), l'importo si ricalcola da quantità e prezzo, la lettura AI resta
 * conservata in `ai_originale` per il confronto.
 */
export function correggiRiga(righe: ReadonlyArray<DDTRigaNuova>, i: number, patch: Partial<DDTRigaNuova>): DDTRigaNuova[] {
  return righe.map((r, j) => {
    if (i !== j) return r;
    const nuova: DDTRigaNuova = {
      ...r,
      ...patch,
      purchase_order_item_id: null,
      abbinamento: null,
      origine: "manuale",
    };
    return { ...nuova, importo: importoRiga({ ...nuova, importo: null }) };
  });
}

export function aggiungiRiga(righe: ReadonlyArray<DDTRigaNuova>): DDTRigaNuova[] {
  return [...righe, rigaBollaVuota(righe.length + 1)];
}

export function togliRiga(righe: ReadonlyArray<DDTRigaNuova>, i: number): DDTRigaNuova[] {
  return righe.filter((_, j) => j !== i).map((r, j) => ({ ...r, posizione: j + 1 }));
}

/** Il campo numerico come lo scrive la persona: vuoto è «non so», la virgola vale il punto. */
export function numeroDaCampo(valore: string): number | null {
  const t = valore.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export interface TestataBolla {
  numero: string;
  /** YYYY-MM-DD */
  data: string;
  supplierId: string | null;
  orderId: string | null;
  destinazione: "magazzino" | "cantiere";
}

/** Cosa manca per poter registrare la bolla. Vale per tutte le finestre. */
export function problemiBolla(b: Pick<TestataBolla, "numero" | "data" | "destinazione" | "orderId"> & { righe: ReadonlyArray<DDTRigaNuova> }): string[] {
  const p: string[] = [];
  if (!b.numero.trim()) p.push("manca il numero");
  if (!b.data) p.push("manca la data");
  if (b.destinazione === "cantiere" && !b.orderId) p.push("in cantiere serve la commessa");
  // Il database rifiuta la riga senza descrizione: meglio dirlo qui che dopo il clic.
  if (b.righe.some((r) => !r.descrizione.trim())) p.push("manca la descrizione in una riga");
  if (b.righe.some((r) => r.quantita != null && (!Number.isFinite(r.quantita) || r.quantita < 0))) p.push("quantità non valida nelle righe");
  if (b.righe.some((r) => r.prezzo_unitario != null && (!Number.isFinite(r.prezzo_unitario) || r.prezzo_unitario < 0))) p.push("prezzo non valido nelle righe");
  return p;
}
