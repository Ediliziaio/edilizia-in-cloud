/**
 * La ricerca degli indirizzi, una sola per tutta l'app (30/10/2026).
 *
 * Due chiamate alla edge function maps-proxy (HERE: «autocomplete» per i suggerimenti mentre si scrive,
 * «place-details» per i pezzi dell'indirizzo scelto) e il modo di leggere la risposta. Prima la stessa cosa
 * stava dentro AddressAutocomplete e, copiata, nel fotovoltaico; una ventina di campi non cercava niente.
 * Il campo che la usa è CampoIndirizzo.
 */
import { supabase } from "@/integrations/supabase/client";

/** Sotto i tre caratteri non si cerca: i suggerimenti sarebbero casuali. */
export const MINIMO_CARATTERI = 3;

export interface SuggerimentoIndirizzo {
  /** Id del servizio (HERE: «here:…»), serve per chiedere i dettagli. */
  id: string;
  /** Come lo scrive il servizio: «Via Roma, 1, 20121 Milano MI, Italia». */
  testo: string;
}

export interface IndirizzoTrovato {
  id: string;
  /** Via e numero civico: «Via Roma 1». Vuota se si è scelto un comune o una località. */
  via: string;
  cap: string;
  citta: string;
  /** Sigla di due lettere («MI»), vuota se il servizio non la dà. */
  provincia: string;
  /** La riga all'italiana: «Via Roma 1, 20121 Milano (MI)». */
  testo: string;
  /** L'indirizzo come lo scrive il servizio. */
  etichetta: string;
  lat: number | null;
  lng: number | null;
}

/** La ricerca non ha risposto: chi la usa lo dice e lascia scrivere a mano. */
export class RicercaNonDisponibile extends Error {
  constructor() {
    super("Ricerca indirizzi non disponibile");
    this.name = "RicercaNonDisponibile";
  }
}

const pulito = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** «MI» da «mi» o « MI »; niente per i nomi per esteso (i campi provincia sono da due lettere). */
export function siglaProvincia(v: unknown): string {
  const s = pulito(v).toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : "";
}

/** «Via Roma 1, 20121 Milano (MI)»: i pezzi che mancano non lasciano virgole o parentesi vuote. */
export function testoIndirizzo(p: { via?: string | null; cap?: string | null; citta?: string | null; provincia?: string | null }): string {
  const via = pulito(p.via);
  const provincia = siglaProvincia(p.provincia) || pulito(p.provincia);
  const luogo = [pulito(p.cap), pulito(p.citta)].filter(Boolean).join(" ");
  const conProvincia = provincia ? (luogo ? `${luogo} (${provincia})` : provincia) : luogo;
  return [via, conProvincia].filter(Boolean).join(", ");
}

function coordinata(v: unknown, massimo: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= massimo ? v : null;
}

/** I suggerimenti mentre si scrive. Lancia RicercaNonDisponibile se il servizio non risponde. */
export async function cercaIndirizzi(testo: string): Promise<SuggerimentoIndirizzo[]> {
  if (testo.trim().length < MINIMO_CARATTERI) return [];
  let risposta: { data: unknown; error: unknown };
  try {
    risposta = await supabase.functions.invoke("maps-proxy", {
      body: { action: "autocomplete", query: testo, country: "it" },
    });
  } catch {
    throw new RicercaNonDisponibile();
  }
  const dati = risposta.data as { predictions?: unknown; error?: unknown } | null;
  if (risposta.error || !dati || dati.error || !Array.isArray(dati.predictions)) throw new RicercaNonDisponibile();
  const visti = new Set<string>();
  const suggerimenti: SuggerimentoIndirizzo[] = [];
  for (const p of dati.predictions as Array<{ place_id?: unknown; description?: unknown }>) {
    const id = pulito(p?.place_id);
    const descrizione = pulito(p?.description);
    if (!id || !descrizione || visti.has(id)) continue;
    visti.add(id);
    suggerimenti.push({ id, testo: descrizione });
  }
  return suggerimenti;
}

/** I pezzi dell'indirizzo dalla risposta di «place-details». */
export function indirizzoDaDettaglio(s: SuggerimentoIndirizzo, dati: unknown): IndirizzoTrovato {
  const d = (dati && typeof dati === "object" ? dati : {}) as Record<string, unknown>;
  const via = pulito(d.address_line);
  const cap = pulito(d.postal_code);
  const citta = pulito(d.city);
  const provincia = siglaProvincia(d.province);
  const etichetta = pulito(d.formatted_address) || s.testo;
  const lat = coordinata(d.lat, 90);
  const lng = coordinata(d.lng, 180);
  return {
    id: s.id,
    via,
    cap,
    citta,
    provincia,
    testo: testoIndirizzo({ via, cap, citta, provincia }) || etichetta,
    etichetta,
    lat: lat != null && lng != null ? lat : null,
    lng: lat != null && lng != null ? lng : null,
  };
}

export type CampoDiviso = "via" | "citta" | "cap" | "provincia";

/**
 * Per i moduli con via, città, CAP e provincia in campi separati: la via si scrive sempre (vuota se si è scelto
 * un comune), gli altri solo se il servizio li dà, così un CAP scritto a mano non si cancella.
 */
export function riempiCampi(a: IndirizzoTrovato, scrivi: (campo: CampoDiviso, valore: string) => void): void {
  scrivi("via", a.via);
  if (a.citta) scrivi("citta", a.citta);
  if (a.cap) scrivi("cap", a.cap);
  if (a.provincia) scrivi("provincia", a.provincia);
}

/**
 * «Via Roma 12/A» → strada «Via Roma», civico «12/A»: per i moduli col civico in un campo a parte. Il civico è
 * l'ultimo pezzo se comincia con una cifra; un numero dentro il nome («Via 4 Novembre») resta nella strada.
 */
export function separaCivico(via: string): { strada: string; civico: string } {
  const testo = via.trim().replace(/\s+/g, " ");
  const m = testo.match(/^(.*\S)\s+(\d+[A-Za-z]?(?:\s*\/\s*[0-9A-Za-z]+)?)$/);
  return m ? { strada: m[1], civico: m[2].replace(/\s+/g, "") } : { strada: testo, civico: "" };
}

/** Come riempiCampi, in un oggetto coi nomi dei campi del modulo: per chi aggiorna lo stato in un colpo solo. */
export function campiDaTrovato<K extends string>(
  a: IndirizzoTrovato,
  nomi: { via: K; citta?: K; cap?: K; provincia?: K },
): Partial<Record<K, string>> {
  const campi: Partial<Record<K, string>> = {};
  riempiCampi(a, (campo, valore) => {
    const nome = nomi[campo];
    if (nome) campi[nome] = valore;
  });
  return campi;
}

/** I dettagli del suggerimento scelto; null se il servizio non li dà (mai coordinate inventate). */
export async function dettaglioIndirizzo(s: SuggerimentoIndirizzo): Promise<IndirizzoTrovato | null> {
  try {
    const { data, error } = await supabase.functions.invoke("maps-proxy", {
      body: { action: "place-details", place_id: s.id },
    });
    if (error || !data || (data as { error?: unknown }).error) return null;
    return indirizzoDaDettaglio(s, data);
  } catch {
    return null;
  }
}
