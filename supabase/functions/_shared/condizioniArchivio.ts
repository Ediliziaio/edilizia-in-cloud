/**
 * L'archivio «Contratti e condizioni» letto dalle edge function (07/11/2026).
 *
 * Stesse regole del codice del browser (`src/lib/condizioni/archivio.ts`), ridotte a quello che
 * serve qui: il modello predefinito di un ambito, il suo testo, e da dove viene.
 *
 * Perché serve: un contratto d'appalto scritto dall'AI inventava garanzia, penali e foro anche
 * quando l'azienda le aveva già scritte. Le clausole dell'azienda non si riscrivono: si riportano.
 */

export type AmbitoCondizioni =
  | "preventivo" | "appalto" | "commessa" | "subappalto"
  | "acquisto" | "fattura" | "manutenzione" | "lavoro";

export interface ClausolaArchivio {
  titolo?: string | null;
  testo?: string | null;
  /** Da approvare specificamente per iscritto (art. 1341 c.c.). */
  vessatoria?: boolean | null;
}

export interface ModelloArchivio {
  id: string;
  nome: string;
  ambito: string;
  predefinito?: boolean | null;
  attivo?: boolean | null;
  versione?: number | null;
  clausole?: ClausolaArchivio[] | null;
}

/** Da dove vengono le condizioni di un documento: resta scritto sul documento, non cambia più. */
export interface OrigineCondizioni {
  modello_id: string;
  modello_nome: string;
  versione: number;
  congelate_il: string;
}

/** Testo vero: non vuoto una volta tolti tag e spazi insulsi. */
export const haParole = (v: unknown): boolean =>
  String(v ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").trim().length > 0;

const senzaFronzoli = (v: string): string =>
  v.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/^#{1,6}\s*/, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Il titolo non si ripete quando il testo si apre già con quello: capita coi contratti importati interi. */
export function titoloGiaNelTesto(titolo: string, testo: string): boolean {
  const primaRiga = testo.split("\n").find((r) => haParole(r)) ?? "";
  return senzaFronzoli(primaRiga) === senzaFronzoli(titolo);
}

export function clausoleBuone(modello: ModelloArchivio | null | undefined): ClausolaArchivio[] {
  return (modello?.clausole ?? []).filter((c) => haParole(c?.titolo) || haParole(c?.testo));
}

/** Il testo stampabile del modello: un titolo e un testo per clausola. */
export function testoDelModello(modello: ModelloArchivio | null | undefined): string {
  return clausoleBuone(modello)
    .map((c) => {
      const titolo = (c.titolo ?? "").trim();
      const testo = (c.testo ?? "").trim();
      const saltaIlTitolo = haParole(titolo) && haParole(testo) && titoloGiaNelTesto(titolo, testo);
      return (saltaIlTitolo ? [testo] : [titolo, testo]).filter(haParole).join("\n");
    })
    .filter(haParole)
    .join("\n\n");
}

/** Le clausole che il committente deve approvare a parte (art. 1341 c.c.), coi loro titoli. */
export function titoliVessatorie(modello: ModelloArchivio | null | undefined): string[] {
  return clausoleBuone(modello)
    .filter((c) => c.vessatoria === true)
    .map((c) => (c.titolo ?? "").trim())
    .filter((t) => t.length > 0);
}

export function origineDelModello(modello: ModelloArchivio, adesso = new Date().toISOString()): OrigineCondizioni {
  return {
    modello_id: modello.id,
    modello_nome: modello.nome,
    versione: Number(modello.versione ?? 1),
    congelate_il: adesso,
  };
}

/**
 * Il modello predefinito dell'azienda per un ambito. Se l'archivio non c'è ancora, o l'azienda non ha
 * scritto niente, torna null e il documento esce come prima: niente si rompe per chi non lo usa.
 */
export async function modelloPredefinitoDellAzienda(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  companyId: string,
  ambito: AmbitoCondizioni,
): Promise<ModelloArchivio | null> {
  try {
    const { data, error } = await supabase
      .from("condizioni_modelli")
      .select("id,nome,ambito,predefinito,attivo,versione,clausole")
      .eq("company_id", companyId)
      .eq("ambito", ambito)
      .eq("predefinito", true)
      .eq("attivo", true)
      .maybeSingle();
    if (error || !data) return null;
    return haParole(testoDelModello(data as ModelloArchivio)) ? (data as ModelloArchivio) : null;
  } catch {
    return null;
  }
}
