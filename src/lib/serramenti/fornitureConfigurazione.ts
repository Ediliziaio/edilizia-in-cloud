import { TIPOLOGIE_DISEGNO } from "./disegnoSerramento";
import { prezzoNetto } from "@/lib/listino/listinoFornitore";
import type { Json } from "@/integrations/supabase/types";

export type ConfigurazioneListinoFornitore = {
  tipologia: string;
  serie: string;
  specifiche: string;
  vendita: number;
  iva_acquisto: number;
  larghezza_mm: number | null;
  altezza_mm: number | null;
};

export type OffertaSerramento = {
  id: string;
  codice: string;
  fornitoreId: string;
  fornitore: string;
  listino: string;
  configurazione: ConfigurazioneListinoFornitore;
  unita: "pz" | "mq";
  acquistoNetto: number;
};

export type FornituraSerramento = {
  v: 1;
  supplier_id: string;
  fornitore: string;
  listino: string;
  voce_id: string;
  codice: string;
  serie: string;
  specifiche: string;
  larghezza_mm: number;
  altezza_mm: number;
  acquisto_unitario: number;
  vendita_unitaria: number;
  iva_acquisto: number;
};

const testo = (v: unknown) => typeof v === "string" ? v.trim() : "";
const misura = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n <= 100_000;
const denaro = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0 && n < 1_000_000_000;
const iva = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
const oggetto = (valore: unknown): Record<string, unknown> | null =>
  valore && typeof valore === "object" && !Array.isArray(valore) ? valore as Record<string, unknown> : null;
const centesimi = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function unitaTariffaSerramento(valore: string | null): OffertaSerramento["unita"] | null {
  const unita = testo(valore).toLowerCase();
  if (["pz", "cad", "cad.", "pezzo", "cadauno"].includes(unita)) return "pz";
  if (["mq", "m²", "m2"].includes(unita)) return "mq";
  return null;
}

export function leggiConfigurazioneFornitore(valore: unknown): ConfigurazioneListinoFornitore | null {
  const r = oggetto(valore);
  if (!r || !TIPOLOGIE_DISEGNO.some(({ id }) => id === r.tipologia) || !testo(r.serie) ||
    !denaro(r.vendita) || !iva(r.iva_acquisto)) return null;
  const misureValide = (r.larghezza_mm == null && r.altezza_mm == null) || (misura(r.larghezza_mm) && misura(r.altezza_mm));
  if (!misureValide) return null;
  return {
    tipologia: String(r.tipologia), serie: testo(r.serie), specifiche: testo(r.specifiche),
    vendita: r.vendita, iva_acquisto: r.iva_acquisto,
    larghezza_mm: (r.larghezza_mm ?? null) as number | null, altezza_mm: (r.altezza_mm ?? null) as number | null,
  };
}

export function offertaDaListino(riga: {
  id: string; codice: string | null; unita: string | null; prezzo: number; sconto_pct: number;
  configurazione_serramento: Json;
  listino: { supplier_id: string; nome: string | null; fornitore: { name: string } | null };
}): OffertaSerramento | null {
  const configurazione = leggiConfigurazioneFornitore(riga.configurazione_serramento);
  const unita = unitaTariffaSerramento(riga.unita);
  const acquistoNetto = prezzoNetto(riga.prezzo, riga.sconto_pct);
  if (!configurazione || !unita || !denaro(acquistoNetto) || !testo(riga.codice) || !riga.listino.fornitore?.name) return null;
  return {
    id: riga.id, codice: testo(riga.codice), fornitoreId: riga.listino.supplier_id,
    fornitore: riga.listino.fornitore.name, listino: riga.listino.nome || "Listino fornitore",
    configurazione, unita, acquistoNetto,
  };
}

export function calcolaFornituraSerramento(
  offerta: OffertaSerramento, larghezza: number | null | undefined, altezza: number | null | undefined,
): FornituraSerramento | null {
  if (!misura(larghezza) || !misura(altezza)) return null;
  const config = offerta.configurazione;
  if (config.larghezza_mm !== null && (config.larghezza_mm !== larghezza || config.altezza_mm !== altezza)) return null;
  const fattore = offerta.unita === "mq" ? (larghezza * altezza) / 1_000_000 : 1;
  const acquisto = centesimi(offerta.acquistoNetto * fattore);
  const vendita = centesimi(config.vendita * fattore);
  if (!denaro(acquisto) || !denaro(vendita)) return null;
  return {
    v: 1, supplier_id: offerta.fornitoreId, fornitore: offerta.fornitore, listino: offerta.listino,
    voce_id: offerta.id, codice: offerta.codice, serie: config.serie, specifiche: config.specifiche,
    larghezza_mm: larghezza, altezza_mm: altezza, acquisto_unitario: acquisto, vendita_unitaria: vendita, iva_acquisto: config.iva_acquisto,
  };
}
