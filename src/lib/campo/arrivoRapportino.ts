import { numeroViaggio } from "@/lib/mezzi/viaggi";

export const CHIAVE_ARRIVO = "__arrivo_cantiere_v1";

export interface ArrivoRapportino {
  mezzoId: string;
  partenza: string;
  km: string;
}

export const ARRIVI_VUOTI: ArrivoRapportino[] = [];
export const MAX_MEZZI_TRASPORTO = 10;

export function arriviDaBozza(raw: ArrivoRapportino[] | ArrivoRapportino | undefined): ArrivoRapportino[] {
  if (Array.isArray(raw)) return raw;
  return raw?.mezzoId ? [raw] : ARRIVI_VUOTI;
}

export function mezzoStradale(mezzo: { tipo: string; contatore_unita?: string | null }): boolean {
  return mezzo.contatore_unita === "km" && ["autovettura", "furgone", "autocarro", "altro"].includes(mezzo.tipo);
}

type CampoArrivo = {
  chiave: typeof CHIAVE_ARRIVO;
  tipo: "arrivo_cantiere";
  mezzo_id: string;
  partenza: string | null;
  km: number | null;
};

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function erroreArrivo(arrivo: ArrivoRapportino): string | null {
  const km = numeroViaggio(arrivo.km);
  if (!uuid.test(arrivo.mezzoId)) return "Scegli un mezzo stradale dell’azienda.";
  if (km != null && (!Number.isFinite(km) || km > 10000)) return "Indica i km percorsi all’andata, fino a 10.000.";
  if (arrivo.partenza.trim().length > 150) return "La partenza può contenere fino a 150 caratteri.";
  return null;
}

export function erroreArrivi(arrivi: ArrivoRapportino[]): string | null {
  if (arrivi.length > MAX_MEZZI_TRASPORTO) return `Puoi indicare fino a ${MAX_MEZZI_TRASPORTO} mezzi di trasporto.`;
  if (new Set(arrivi.map(a => a.mezzoId.toLowerCase())).size !== arrivi.length) return "Indica ogni mezzo di trasporto una sola volta.";
  for (const arrivo of arrivi) {
    const errore = erroreArrivo(arrivo);
    if (errore) return errore;
  }
  return null;
}

export function campoArrivo(arrivi: ArrivoRapportino[]): CampoArrivo[] {
  const errore = erroreArrivi(arrivi);
  if (errore) throw new Error(errore);
  return arrivi.map(arrivo => ({
    chiave: CHIAVE_ARRIVO, tipo: "arrivo_cantiere", mezzo_id: arrivo.mezzoId.toLowerCase(),
    partenza: arrivo.partenza.trim() || null, km: numeroViaggio(arrivo.km),
  }));
}

export function leggiArrivo(raw: unknown): ArrivoRapportino[] {
  if (!Array.isArray(raw)) return ARRIVI_VUOTI;
  const mezzi = new Map<string, ArrivoRapportino>();
  for (const campo of raw) {
    if (campo?.chiave !== CHIAVE_ARRIVO || campo.tipo !== "arrivo_cantiere" ||
        typeof campo.mezzo_id !== "string" || !uuid.test(campo.mezzo_id)) continue;
    const mezzoId = campo.mezzo_id.toLowerCase();
    if (mezzi.has(mezzoId)) continue;
    mezzi.set(mezzoId, {
      mezzoId,
      partenza: typeof campo.partenza === "string" ? campo.partenza.trim().slice(0, 150) : "",
      km: typeof campo.km === "number" && Number.isFinite(campo.km) && campo.km >= 0 && campo.km <= 10000 ? String(campo.km) : "",
    });
  }
  return [...mezzi.values()];
}

export interface ArrivoDaRapportino {
  id: string;
  giorno: string;
  mezzoId: string;
  nomeMezzo: string;
  partenza: string | null;
  km: number | null;
  rapportini: number;
  datiDiscordanti: boolean;
  viaggioId: string | null;
  viaggioGiorno?: string | null;
  viaggioStato: "bozza" | "inviato" | "verificato" | null;
  richiedeCollegamento?: boolean;
  viaggiCompatibili: { id: string; partenza: string; arrivo: string }[];
}
