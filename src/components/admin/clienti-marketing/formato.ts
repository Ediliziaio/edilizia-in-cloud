/** Formattazione italiana dei numeri della console clienti marketing. */

export const eur = (n: number | null | undefined, decimali = 0): string =>
  n == null || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: decimali, useGrouping: true }).format(n);

export const numero = (n: number): string => Math.round(n).toLocaleString("it-IT");

/** Ore in forma leggibile: 40 min, 3,5 h, 4 giorni. */
export function ore(h: number | null | undefined): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${(Math.round(h * 10) / 10).toLocaleString("it-IT")} h`;
  return `${numero(h / 24)} giorni`;
}

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/** «21 lug 2026» oppure «11 set, 10:30». L'anno solo quando non è quello in corso. */
export function dataBreve(iso: string | null | undefined, conOra = false, oggi?: Date): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const anno = oggi && d.getFullYear() !== oggi.getFullYear() ? ` ${d.getFullYear()}` : !oggi ? ` ${d.getFullYear()}` : "";
  const g = `${d.getDate()} ${MESI[d.getMonth()]}${anno}`;
  return conOra ? `${g}, ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : g;
}
