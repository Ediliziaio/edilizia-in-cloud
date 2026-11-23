/**
 * Date, ore, numeri ed euro nella lingua dell'operaio (piano 2026-11-23-lingua-piattaforma, punto 6).
 *
 * - Cambia solo come i valori si MOSTRANO, mai i calcoli.
 * - Inglese = en-GB: giorno/mese come in Italia (en-US metterebbe il mese prima).
 * - Arabo: cifre 0–9 occidentali, le stesse che l'ufficio vede nel PDF.
 * - Fuso orario sempre italiano: le ore di lavoro sono ore del cantiere.
 * - La valuta è sempre l'euro, scritta come si usa nella lingua.
 */
import type { Locale } from "date-fns";
import { it as itDateFns } from "date-fns/locale/it";
import type { CodiceLingua, Lingua } from "./lingue";

export const FUSO_CANTIERE = "Europe/Rome";

/** Il codice Intl da usare per i numeri e le date (con le cifre occidentali per l'arabo). */
export function localeIntl(lingua: Pick<Lingua, "locale" | "rtl">): string {
  return lingua.rtl ? `${lingua.locale}-u-nu-latn` : lingua.locale;
}

export interface Formati {
  locale: string;
  data: (d: Date | string | number, opzioni?: Intl.DateTimeFormatOptions) => string;
  ora: (d: Date | string | number) => string;
  dataOra: (d: Date | string | number) => string;
  numero: (n: number, opzioni?: Intl.NumberFormatOptions) => string;
  euro: (n: number) => string;
}

const comeData = (d: Date | string | number) => (d instanceof Date ? d : new Date(d));

export function formatiPer(lingua: Pick<Lingua, "locale" | "rtl">): Formati {
  const locale = localeIntl(lingua);
  return {
    locale,
    data: (d, opzioni) =>
      new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: FUSO_CANTIERE, ...opzioni }).format(comeData(d)),
    ora: d => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: FUSO_CANTIERE }).format(comeData(d)),
    dataOra: d =>
      new Intl.DateTimeFormat(locale, {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: FUSO_CANTIERE,
      }).format(comeData(d)),
    numero: (n, opzioni) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2, ...opzioni }).format(n),
    // «narrowSymbol»: sempre il simbolo € (in spagnolo argentino, senza, si legge «EUR 1.234,50»).
    euro: n => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", currencyDisplay: "narrowSymbol" }).format(n),
  };
}

/** Calendari di date-fns: l'italiano è già nell'app, gli altri si scaricano solo quando servono. */
const CARICA_DATE_FNS: Record<Exclude<CodiceLingua, "it">, () => Promise<Locale>> = {
  ro: () => import("date-fns/locale/ro").then(m => m.ro),
  sq: () => import("date-fns/locale/sq").then(m => m.sq),
  "ar-MA": () => import("date-fns/locale/ar-MA").then(m => m.arMA),
  "ar-EG": () => import("date-fns/locale/ar-EG").then(m => m.arEG),
  de: () => import("date-fns/locale/de").then(m => m.de),
  fr: () => import("date-fns/locale/fr").then(m => m.fr),
  en: () => import("date-fns/locale/en-GB").then(m => m.enGB),
  es: () => import("date-fns/locale/es").then(m => m.es),
  "es-AR": () => import("date-fns/locale/es").then(m => m.es),
  "es-PE": () => import("date-fns/locale/es").then(m => m.es),
};

export const DATE_FNS_ITALIANO: Locale = itDateFns;

export function caricaLocaleDateFns(codice: CodiceLingua): Promise<Locale> {
  return codice === "it" ? Promise.resolve(itDateFns) : CARICA_DATE_FNS[codice]();
}
