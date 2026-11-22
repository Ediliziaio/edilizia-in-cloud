import type { StockCampo } from "@/hooks/campo/useCampoPrelievo";
import { quantitaPrelievo } from "./magazzino";

type ArticoloBozza = Pick<StockCampo, "id" | "name" | "warehouse_id" | "magazzino" | "unita_misura" | "disponibile">
  & Partial<Pick<StockCampo, "ubicazione" | "internal_code">>;

export interface BozzaPrelievo {
  id: string;
  righe: { articolo: ArticoloBozza; quantita: string }[];
  orderId: string;
  nomeCantiere: string;
  note: string;
  inVerifica: boolean;
}

export interface PrelievoLocale {
  chiave: string;
  cantiere: string;
  bozza: BozzaPrelievo;
}

export const BOZZA_PRELIEVO_VUOTA: BozzaPrelievo = {
  id: "", righe: [], orderId: "", nomeCantiere: "", note: "", inVerifica: false,
};
const PREFISSO = "campo-prelievo:";

export function chiaveBozzaPrelievo(companyId: string, userId: string, cantiereIniziale = "", indice = 0) {
  const parti = [companyId, userId, cantiereIniziale];
  if (indice) parti.push(String(indice));
  return PREFISSO + JSON.stringify(parti);
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
        && (riga.articolo.ubicazione === undefined || testoONull(riga.articolo.ubicazione))
        && (riga.articolo.internal_code === undefined || testoONull(riga.articolo.internal_code)))) {
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

export function bozzeCantieriPrelievo(companyId: string, userId: string): PrelievoLocale[] {
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
  const bozze: PrelievoLocale[] = [];
  for (const chiave of chiavi) {
    try {
      const [, , cantiere] = JSON.parse(chiave.slice(PREFISSO.length)) as unknown[];
      if (typeof cantiere !== "string") continue;
      const bozza = leggiBozzaPrelievo(chiave);
      if (bozza.righe.length) bozze.push({ chiave, cantiere: bozza.orderId || cantiere, bozza });
    } catch { /* Chiave di una bozza illeggibile. */ }
  }
  return bozze;
}

export function bozzaPerCantiere(bozze: PrelievoLocale[], companyId: string, userId: string, cantiere: string): PrelievoLocale {
  const presenti = bozze.filter((prelievo) => prelievo.cantiere === cantiere);
  const esistente = presenti.find(({ bozza }) => !bozza.inVerifica) ?? presenti[0];
  if (esistente) return esistente;

  // Le bozze precedenti potevano cambiare destinazione conservando la chiave iniziale.
  let indice = 0;
  let chiave = chiaveBozzaPrelievo(companyId, userId, cantiere);
  while (bozze.some((prelievo) => prelievo.chiave === chiave)) {
    chiave = chiaveBozzaPrelievo(companyId, userId, cantiere, ++indice);
  }
  return { chiave, cantiere, bozza: BOZZA_PRELIEVO_VUOTA };
}

export function quantitaNelleBozze(bozze: PrelievoLocale[]) {
  const totali = new Map<string, number>();
  for (const { bozza } of bozze) {
    // Se l'invio è incerto, la scorta potrebbe essere già stata scalata.
    if (bozza.inVerifica) continue;
    for (const { articolo, quantita } of bozza.righe) {
      const valore = quantitaPrelievo(quantita);
      if (valore > 0) totali.set(articolo.id, (totali.get(articolo.id) ?? 0) + valore);
    }
  }
  return totali;
}
