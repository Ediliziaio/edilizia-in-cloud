/**
 * «Documenti da confermare»: le bozze che l'AI ha letto dagli allegati delle email
 * (email_documento_estratto) e che aspettano una persona.
 *
 * Il 30/10/2026 ce n'erano 158 ferme e nessuna mai confermata né scartata: la
 * schermata di conferma esisteva solo dentro la singola email e nessun elenco diceva
 * che c'era qualcosa da fare. Qui stanno le regole dell'elenco unico e del numero in home:
 *   · contano, e vengono per prime, le bozze di documenti veri (fattura, DDT, proforma,
 *     nota di credito); il tipo «altro» (listini, brochure, moduli: il 38% delle bozze)
 *     sta in fondo, scartabile in blocco, e non entra nel numero;
 *   · una riga dice chi, che cosa e quanto in una occhiata: il resto sta nel dettaglio.
 */
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

export const TIPO_ALTRO = "altro";

/** Quante bozze legge l'elenco: oltre, il resto si vede dopo aver confermato o scartato queste. */
export const LIMITE_ELENCO = 200;

type Campi = Record<string, { valore: string | number | null; conf?: number } | undefined> | null | undefined;

export interface BozzaLetta {
  tipo: string | null;
  campi: Campi;
  dati_incerti: string[] | null;
  created_at: string;
}

/** «altro» è anche ciò che non ha un tipo: nessuno sa dire che documento sia. */
export function eAltro(tipo: string | null | undefined): boolean {
  const t = (tipo ?? "").trim().toLowerCase();
  return t === "" || t === TIPO_ALTRO;
}

const ETICHETTE: Record<string, string> = {
  fattura: "Fattura",
  proforma: "Proforma",
  nota_credito: "Nota di credito",
  ddt: "Bolla (DDT)",
};

export function etichettaTipo(tipo: string | null | undefined): string {
  if (eAltro(tipo)) return "Altro documento";
  const t = String(tipo).trim().toLowerCase();
  return ETICHETTE[t] ?? t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Il testo di un campo, o null se manca o è vuoto. */
export function testoCampo(campi: Campi, chiave: string): string | null {
  const v = campi?.[chiave]?.valore;
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Un importo da un numero o da un testo all'italiana («1.234,56», «€ 12,5»); null se non è un numero. */
export function numeroItaliano(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = v.replace(/[€\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** «12 ott 2026» da una data ISO; il testo com'è se non si capisce. */
export function dataLeggibile(valore: string | null): string | null {
  if (!valore) return null;
  const d = parseISO(valore);
  return Number.isNaN(d.getTime()) ? valore : format(d, "d MMM yyyy", { locale: it });
}

export interface RiepilogoBozza {
  fornitore: string | null;
  numero: string | null;
  data: string | null;
  totale: number | null;
  /** Quanti campi l'AI ha segnato come incerti: sono quelli da guardare sul PDF. */
  incerti: number;
}

export function riepilogoBozza(b: BozzaLetta): RiepilogoBozza {
  return {
    fornitore: testoCampo(b.campi, "fornitore_ragione_sociale"),
    numero: testoCampo(b.campi, "numero"),
    data: dataLeggibile(testoCampo(b.campi, "data")),
    totale: numeroItaliano(b.campi?.totale?.valore),
    incerti: new Set(b.dati_incerti ?? []).size,
  };
}

/** «Fattura · n. 118 · 12 ott 2026»: tipo, numero e data, quel che c'è. */
export function sottotitoloBozza(b: BozzaLetta): string {
  const r = riepilogoBozza(b);
  return [etichettaTipo(b.tipo), r.numero ? `n. ${r.numero}` : null, r.data].filter(Boolean).join(" · ");
}

/** Documenti veri da una parte, «altro» dall'altra; l'ordine di arrivo si conserva. */
export function dividiPerTipo<T extends { tipo: string | null }>(righe: T[]): { principali: T[]; altro: T[] } {
  const principali: T[] = [];
  const altro: T[] = [];
  for (const r of righe) (eAltro(r.tipo) ? altro : principali).push(r);
  return { principali, altro };
}

/** Da quanto aspetta: «oggi», «ieri», «3 giorni fa», «2 settimane fa», «3 mesi fa». */
export function etaBozza(creataIl: string, ora: Date = new Date()): string {
  const giorni = Math.max(0, differenceInCalendarDays(ora, parseISO(creataIl)));
  if (Number.isNaN(giorni)) return "";
  if (giorni === 0) return "oggi";
  if (giorni === 1) return "ieri";
  if (giorni < 14) return `${giorni} giorni fa`;
  if (giorni < 60) return `${Math.floor(giorni / 7)} settimane fa`;
  return `${Math.floor(giorni / 30)} mesi fa`;
}

/** Il mittente dell'email, come lo leggerebbe una persona: il nome, se c'è, altrimenti l'indirizzo. */
export function mittenteEmail(email: { from_name: string | null; from_email: string | null } | null | undefined): string | null {
  const nome = email?.from_name?.trim();
  if (nome) return nome;
  return email?.from_email?.trim() || null;
}

/** Il numero da mostrare in un riquadro stretto: oltre 99, «99+». */
export function conteggioCompatto(n: number): string {
  return n > 99 ? "99+" : String(n);
}
