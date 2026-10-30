// src/components/orders/generali/contratto/formato.ts
// Come il modulo «Contratto e SAL» scrive importi, numeri, percentuali e date (all'italiana),
// e come legge i numeri scritti nei campi.
import { formattaEuroContratto } from "@/lib/orders/generali/contratto";
import { leggiNumero } from "@/lib/orders/generali/contrattoElenco";

export const euro = (n: number | null | undefined) => (n === null || n === undefined ? "—" : formattaEuroContratto(n));
const NUMERO = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 });
export const numeroIt = (n: number | null | undefined, decimali = 4) =>
  n === null || n === undefined ? "" : new Intl.NumberFormat("it-IT", { maximumFractionDigits: decimali }).format(n);
export const percentoIt = (n: number) => `${NUMERO.format(n)}%`;
export const dataIt = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [a, m, g] = iso.slice(0, 10).split("-");
  return g && m && a ? `${g}/${m}/${a}` : iso;
};
/** Il testo di un campo numerico: vuoto = null; altrimenti il numero, o NaN se non si legge. */
export const daTesto = (t: string): number | null => (t.trim() === "" ? null : leggiNumero(t) ?? Number.NaN);

/** Almeno un numero scritto male (vedi CampoNumero): non si salva. */
export const haNumeriSbagliati = (o: object) => Object.values(o).some((v) => typeof v === "number" && Number.isNaN(v));
