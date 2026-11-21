import type { StockCampo } from "@/hooks/campo/useCampoPrelievo";

type ArticoloBozza = Pick<StockCampo, "id" | "name" | "warehouse_id" | "magazzino" | "unita_misura" | "disponibile">
  & Partial<Pick<StockCampo, "ubicazione">>;

export interface BozzaPrelievo {
  id: string;
  righe: { articolo: ArticoloBozza; quantita: string }[];
  orderId: string;
  nomeCantiere: string;
  note: string;
  inVerifica: boolean;
}

export const BOZZA_PRELIEVO_VUOTA: BozzaPrelievo = {
  id: "", righe: [], orderId: "", nomeCantiere: "", note: "", inVerifica: false,
};
const PREFISSO = "campo-prelievo:";

export function chiaveBozzaPrelievo(companyId: string, userId: string, cantiereIniziale?: string) {
  return PREFISSO + JSON.stringify([companyId, userId, cantiereIniziale ?? ""]);
}

const testoONull = (value: unknown) => typeof value === "string" || value === null;

function decodificaBozza(contenuto: string): BozzaPrelievo | null {
  try {
    const bozza = JSON.parse(contenuto) as (Partial<BozzaPrelievo> & { richiestaId?: string | null }) | null;
    if (bozza && typeof bozza.orderId === "string" && typeof bozza.note === "string"
      && Array.isArray(bozza.righe) && bozza.righe.length > 0 && bozza.righe.length <= 100
      && bozza.righe.every((riga) => riga?.articolo && typeof riga.quantita === "string"
        && typeof riga.articolo.id === "string" && typeof riga.articolo.name === "string"
        && Number.isFinite(riga.articolo.disponibile) && testoONull(riga.articolo.warehouse_id)
        && testoONull(riga.articolo.magazzino) && testoONull(riga.articolo.unita_misura)
        && (riga.articolo.ubicazione === undefined || testoONull(riga.articolo.ubicazione)))) {
      const idPrecedente = typeof bozza.richiestaId === "string" ? bozza.richiestaId : "";
      const inVerifica = bozza.inVerifica === true || !!idPrecedente;
      const id = typeof bozza.id === "string" && bozza.id ? bozza.id : idPrecedente;
      if (inVerifica && (!id || !bozza.orderId)) return null;
      return {
        id: id || crypto.randomUUID(), righe: bozza.righe, orderId: bozza.orderId,
        nomeCantiere: typeof bozza.nomeCantiere === "string" ? bozza.nomeCantiere : "",
        note: bozza.note, inVerifica,
      };
    }
  } catch {
    // Una bozza illeggibile non può essere inviata.
  }
  return null;
}

export function leggiBozzaPrelievo(chiave: string): BozzaPrelievo {
  try {
    const sulDispositivo = localStorage.getItem(chiave);
    if (sulDispositivo !== null) return decodificaBozza(sulDispositivo) ?? BOZZA_PRELIEVO_VUOTA;
    const nellaScheda = sessionStorage.getItem(chiave);
    const bozza = nellaScheda && decodificaBozza(nellaScheda);
    if (bozza) {
      // La migrazione mantiene l'identificativo di un invio già partito.
      localStorage.setItem(chiave, JSON.stringify(bozza));
      sessionStorage.removeItem(chiave);
      return bozza;
    }
  } catch {
    // Un errore di scrittura lascia la vecchia bozza nella scheda.
  }
  return BOZZA_PRELIEVO_VUOTA;
}

export function salvaBozzaPrelievo(chiave: string, precedente: BozzaPrelievo, bozza: BozzaPrelievo) {
  try {
    const attuale = leggiBozzaPrelievo(chiave);
    if (JSON.stringify(attuale) !== JSON.stringify(precedente)) return { stato: "cambiata", bozza: attuale } as const;
    // Il valore vuoto impedisce a una scheda aperta prima dell'aggiornamento di ripristinare una vecchia copia.
    localStorage.setItem(chiave, bozza.righe.length ? JSON.stringify(bozza) : "null");
    return { stato: "salvata" } as const;
  } catch {
    return { stato: "errore" } as const;
  }
}

export function bozzeCantieriPrelievo(companyId: string, userId: string) {
  const prefisso = PREFISSO + JSON.stringify([companyId, userId]).slice(0, -1) + ",";
  const chiavi = new Set<string>();
  try {
    for (const deposito of [localStorage, sessionStorage]) {
      for (let i = 0; i < deposito.length; i++) {
        const chiave = deposito.key(i);
        if (chiave?.startsWith(prefisso)) chiavi.add(chiave);
      }
    }
  } catch { /* Il magazzino si apre anche se il deposito locale è indisponibile. */ }
  const bozze = [];
  for (const chiave of chiavi) {
    try {
      const [, , cantiere] = JSON.parse(chiave.slice(PREFISSO.length)) as unknown[];
      if (typeof cantiere !== "string" || !cantiere) continue;
      const bozza = leggiBozzaPrelievo(chiave);
      if (bozza.righe.length) bozze.push({ cantiere, bozza });
    } catch { /* Chiave di una bozza illeggibile. */ }
  }
  return bozze;
}
