/** CSV e celle Excel: il punto decimale non è un separatore delle migliaia.
 * Il raggruppamento italiano è ammesso solo insieme alla virgola decimale.
 */
export function numeroImportazioneMagazzino(value: string): number | null {
  const text = value.trim();
  let normalized: string;
  if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(text)) normalized = text.replaceAll(".", "").replace(",", ".");
  else if (/^\d+(?:[.,]\d+)?$/.test(text)) normalized = text.replace(",", ".");
  else return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
