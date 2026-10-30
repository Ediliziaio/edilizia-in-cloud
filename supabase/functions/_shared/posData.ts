/** Giorno italiano (aaaa-mm-gg) di un istante: toISOString() è in UTC e fra mezzanotte e l'una (le due d'estate) dà ieri. */
export function oggiRoma(adesso: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(adesso);
}

/**
 * gg/mm/aaaa di una data semplice (aaaa-mm-gg) o di un istante con fuso (…Z, …+01:00): per l'istante vale il giorno
 * italiano. Ciò che non si riconosce torna com'è.
 */
export function dataRomaDaIso(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = String(iso);
  const semplice = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (semplice) return `${semplice[3]}/${semplice[2]}/${semplice[1]}`;
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(t)) {
    const d = new Date(t);
    if (!Number.isNaN(+d)) return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  }
  const inizio = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return inizio ? `${inizio[3]}/${inizio[2]}/${inizio[1]}` : t;
}
