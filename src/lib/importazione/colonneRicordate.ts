/**
 * Le colonne ricordate (23/11/2026): per ogni azienda, quale campo va a ogni
 * intestazione del file. La seconda volta che arriva un file con le stesse colonne
 * il collegamento è già fatto, da qualunque computer. '' vuol dire «non importare».
 */
interface Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (tabella: string) => any;
}

export type OggettoImport = "contatti" | "opportunita";

/** Le intestazioni si confrontano senza maiuscole e spazi in più. */
export const chiaveIntestazione = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");

export async function caricaColonne(db: Db, companyId: string, oggetto: OggettoImport): Promise<Record<string, string>> {
  try {
    const { data, error } = await db.from("importazioni_colonne_ricordate")
      .select("intestazione, campo").eq("company_id", companyId).eq("oggetto", oggetto);
    if (error) return {};
    return Object.fromEntries(((data ?? []) as { intestazione: string; campo: string }[]).map((r) => [r.intestazione, r.campo]));
  } catch {
    return {};
  }
}

/**
 * Il collegamento automatico, corretto con quello che l'azienda ha scelto le volte
 * prima. Un campo che non esiste più (un campo personalizzato cancellato) si ignora.
 */
export function applicaColonneRicordate(
  intestazioni: string[], automatico: Record<string, string>, ricordate: Record<string, string>, campiValidi: string[],
): Record<string, string> {
  const validi = new Set(campiValidi);
  const risultato: Record<string, string> = { ...automatico };
  for (const h of intestazioni) {
    const scelta = ricordate[chiaveIntestazione(h)];
    if (scelta === undefined) continue;
    if (scelta === "") delete risultato[h];
    else if (validi.has(scelta)) risultato[h] = scelta;
  }
  return risultato;
}

/** Salva come sono state collegate le colonne di questo file. Non ferma mai l'importazione. */
export async function salvaColonne(db: Db, companyId: string, oggetto: OggettoImport, intestazioni: string[], collegamento: Record<string, string>) {
  const righe = [...new Map(intestazioni.filter((h) => h.trim()).map((h) => [chiaveIntestazione(h), {
    company_id: companyId, oggetto, intestazione: chiaveIntestazione(h), campo: collegamento[h] ?? "", updated_at: new Date().toISOString(),
  }])).values()];
  if (!righe.length) return;
  try {
    await db.from("importazioni_colonne_ricordate").upsert(righe, { onConflict: "company_id,oggetto,intestazione" });
  } catch {
    // Ricordare le colonne è una comodità: se non riesce, la prossima volta si ricollegano.
  }
}
