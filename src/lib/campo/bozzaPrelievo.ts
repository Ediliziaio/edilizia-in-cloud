import type { StockCampo } from "@/hooks/campo/useCampoPrelievo";

type ArticoloBozza = Pick<StockCampo, "id" | "name" | "warehouse_id" | "magazzino" | "unita_misura" | "disponibile">;

export interface BozzaPrelievo {
  righe: { articolo: ArticoloBozza; quantita: string }[];
  orderId: string;
  note: string;
  richiestaId: string | null;
}

export const BOZZA_PRELIEVO_VUOTA: BozzaPrelievo = { righe: [], orderId: "", note: "", richiestaId: null };

export function chiaveBozzaPrelievo(companyId: string, userId: string, cantiereIniziale?: string) {
  return `campo-prelievo:${JSON.stringify([companyId, userId, cantiereIniziale ?? ""])}`;
}

const testoONull = (value: unknown) => typeof value === "string" || value === null;

export function leggiBozzaPrelievo(chiave: string): BozzaPrelievo {
  try {
    const contenuto = sessionStorage.getItem(chiave);
    if (!contenuto) return BOZZA_PRELIEVO_VUOTA;
    const bozza = JSON.parse(contenuto) as Partial<BozzaPrelievo> | null;
    if (bozza && typeof bozza.orderId === "string" && typeof bozza.note === "string"
      && (bozza.richiestaId === null || (typeof bozza.richiestaId === "string" && !!bozza.richiestaId && !!bozza.orderId))
      && Array.isArray(bozza.righe) && bozza.righe.length > 0 && bozza.righe.length <= 100
      && bozza.righe.every((riga) => riga?.articolo && typeof riga.quantita === "string"
        && typeof riga.articolo.id === "string" && typeof riga.articolo.name === "string"
        && Number.isFinite(riga.articolo.disponibile) && testoONull(riga.articolo.warehouse_id)
        && testoONull(riga.articolo.magazzino) && testoONull(riga.articolo.unita_misura))) {
      return bozza as BozzaPrelievo;
    }
  } catch {
    // Il modulo resta utilizzabile se la memoria della scheda non è disponibile.
  }
  return BOZZA_PRELIEVO_VUOTA;
}

export function salvaBozzaPrelievo(chiave: string, bozza: BozzaPrelievo) {
  try {
    if (bozza.righe.length) sessionStorage.setItem(chiave, JSON.stringify(bozza));
    else sessionStorage.removeItem(chiave);
  } catch {
    // Lo stato in memoria resta disponibile nella schermata corrente.
  }
}
