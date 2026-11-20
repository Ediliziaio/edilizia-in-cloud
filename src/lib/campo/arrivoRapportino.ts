import { numeroViaggio } from "@/lib/mezzi/viaggi";

export const CHIAVE_ARRIVO = "__arrivo_cantiere_v1";

export interface ArrivoRapportino {
  mezzoId: string;
  partenza: string;
  km: string;
}

export const ARRIVO_VUOTO: ArrivoRapportino = { mezzoId: "", partenza: "", km: "" };

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
  if (!arrivo.mezzoId) return null;
  const km = numeroViaggio(arrivo.km);
  if (!uuid.test(arrivo.mezzoId)) return "Scegli un mezzo stradale dell’azienda.";
  if (km != null && (!Number.isFinite(km) || km > 10000)) return "Indica i km percorsi all’andata, fino a 10.000.";
  if (arrivo.partenza.trim().length > 150) return "La partenza può contenere fino a 150 caratteri.";
  return null;
}

export function campoArrivo(arrivo: ArrivoRapportino): CampoArrivo[] {
  const errore = erroreArrivo(arrivo);
  if (errore) throw new Error(errore);
  if (!arrivo.mezzoId) return [];
  return [{
    chiave: CHIAVE_ARRIVO, tipo: "arrivo_cantiere", mezzo_id: arrivo.mezzoId.toLowerCase(),
    partenza: arrivo.partenza.trim() || null, km: numeroViaggio(arrivo.km),
  }];
}

export function leggiArrivo(raw: unknown): ArrivoRapportino {
  if (!Array.isArray(raw)) return ARRIVO_VUOTO;
  const campi = raw.filter((campo): campo is CampoArrivo => !!campo && typeof campo === "object" && campo.chiave === CHIAVE_ARRIVO);
  if (campi.length !== 1) return ARRIVO_VUOTO;
  const campo = campi[0];
  if (campo.tipo !== "arrivo_cantiere" || typeof campo.mezzo_id !== "string" || !uuid.test(campo.mezzo_id)) return ARRIVO_VUOTO;
  return {
    mezzoId: campo.mezzo_id.toLowerCase(),
    partenza: typeof campo.partenza === "string" ? campo.partenza.trim().slice(0, 150) : "",
    km: typeof campo.km === "number" && Number.isFinite(campo.km) && campo.km >= 0 && campo.km <= 10000 ? String(campo.km) : "",
  };
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
  viaggioStato: "bozza" | "inviato" | "verificato" | null;
  richiedeCollegamento?: boolean;
  viaggiCompatibili: { id: string; partenza: string; arrivo: string }[];
}
