/**
 * I documenti che una ditta deve avere per entrare in cantiere (26/11/2026, piano campo completo, punto 3.1).
 * Funzione pura: dai documenti del fascicolo dice cosa manca, cosa è scaduto e cosa scade entro 30 giorni.
 * L'elenco è quello minimo dell'edilizia (D.Lgs. 81/08 art. 90 e allegato XVII, patente a crediti dal 1/10/2024);
 * il POS si consegna a parte (PosDellaDitta).
 */
export const DOCUMENTI_OBBLIGATORI = [
  { tipo: "durc", label: "DURC" },
  { tipo: "visura", label: "Visura camerale" },
  { tipo: "patente_crediti", label: "Patente a crediti" },
  { tipo: "polizza_rc", label: "Polizza RC" },
] as const;

export type StatoDocumentoDitta = "manca" | "scaduto" | "in_scadenza" | "ok";

export function statoDocumentiDitta(
  documenti: ReadonlyArray<{ tipo: string; data_scadenza: string | null }>,
  oggi: string,
): Array<{ tipo: string; label: string; stato: StatoDocumentoDitta; scadenza: string | null }> {
  const tra30 = new Date(`${oggi}T12:00:00`);
  tra30.setDate(tra30.getDate() + 30);
  const limite = tra30.toISOString().slice(0, 10);
  return DOCUMENTI_OBBLIGATORI.map(({ tipo, label }) => {
    const dello = documenti.filter(d => d.tipo === tipo);
    if (!dello.length) return { tipo, label, stato: "manca" as const, scadenza: null as string | null };
    // Il più lungo: senza scadenza vale come valido.
    const senza = dello.some(d => !d.data_scadenza);
    const scadenza = senza ? null : dello.map(d => d.data_scadenza!).sort().at(-1)!;
    const stato: StatoDocumentoDitta = !scadenza ? "ok" : scadenza < oggi ? "scaduto" : scadenza <= limite ? "in_scadenza" : "ok";
    return { tipo, label, stato, scadenza };
  });
}
