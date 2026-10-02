/**
 * La «nota interna» di un appuntamento vive su appointments.internal_notes, ma
 * chi cerca cosa si è scritto su un cliente guarda gli «Appunti» della scheda
 * (marketing_contact_notes). Quando si salva l'appuntamento, la nota nuova o
 * modificata va riportata anche lì, con data e autore.
 */

export interface DatiNotaAppuntamento {
  titolo: string;
  /** yyyy-MM-dd */
  data: string;
  /** HH:mm */
  ora: string;
  /** Testo della nota interna così com'è nel campo. */
  nota: string | null | undefined;
  /** Testo che l'appuntamento aveva prima di questo salvataggio. */
  notaPrecedente?: string | null;
}

/** Il testo da riportare negli Appunti, o null se non c'è nulla da riportare. */
export function testoNotaPerRegistro(d: DatiNotaAppuntamento): string | null {
  const nuova = (d.nota ?? "").trim();
  if (!nuova) return null;
  // Non cambiata: riportarla di nuovo la farebbe comparire due volte.
  if (nuova === (d.notaPrecedente ?? "").trim()) return null;
  const [anno, mese, giorno] = d.data.split("-");
  const quando = anno && mese && giorno ? `${giorno}/${mese}/${anno}` : d.data;
  const titolo = d.titolo.trim() || "Appuntamento";
  return `Nota dall'appuntamento «${titolo}» del ${quando} alle ${d.ora.slice(0, 5)}:\n${nuova}`;
}
