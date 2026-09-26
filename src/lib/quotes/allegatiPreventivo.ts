/**
 * Schede tecniche allegate a un preventivo (quote_pdf_attachments): come si
 * allegano senza che una sola rifiutata si porti via le altre.
 *
 * Dal 26/09/2026 il database rifiuta la scheda che non è dell'azienda del
 * preventivo, o il cui file sta nella cartella di un'altra azienda (trigger
 * allegato_preventivo_stessa_azienda, errore 42501). Un inserimento di più
 * righe è tutto o niente: con una scheda rifiutata non entrava nessuna. E chi
 * allega lo fa quando il preventivo esiste già, quindi un errore qui non deve
 * far credere che il preventivo non ci sia (chi riprova ne crea un secondo).
 *
 * Quindi: prima tutte insieme (il caso normale, una sola chiamata); se il
 * database dice di no, una per volta, così entrano le buone e le altre tornano
 * indietro col motivo, da dire a chi salva.
 */
import { supabase } from "@/integrations/supabase/client";
import { userErrorMessage } from "@/lib/userErrorMessage";

export interface SchedaDaAllegare {
  material_id: string;
  sort_order: number | null;
  /** Il nome da mostrare se non entra. Può mancare: la scheda di un'altra azienda l'utente non la vede. */
  nome?: string | null;
}

export interface SchedaNonAllegata {
  material_id: string;
  nome: string | null;
  errore: { code?: string; message?: string };
}

/** Il rifiuto del trigger: la scheda (o il suo file) non è dell'azienda del preventivo. */
function eSchedaDiUnAltraAzienda(errore: SchedaNonAllegata["errore"]): boolean {
  return errore.code === "42501" && /non è di questa azienda/i.test(errore.message ?? "");
}

/**
 * Allega le schede al preventivo. Ritorna quelle che il database non ha preso
 * (vuoto = tutte allegate). Non lancia: il preventivo a questo punto c'è già.
 */
export async function allegaSchedeTecniche(
  quoteId: string,
  schede: SchedaDaAllegare[],
): Promise<SchedaNonAllegata[]> {
  if (schede.length === 0) return [];
  const riga = (s: SchedaDaAllegare) => ({ quote_id: quoteId, material_id: s.material_id, sort_order: s.sort_order });

  const { error } = await supabase.from("quote_pdf_attachments").insert(schede.map(riga));
  if (!error) return [];

  const esiti = await Promise.all(schede.map((s) => supabase.from("quote_pdf_attachments").insert(riga(s))));
  return schede.flatMap((s, i): SchedaNonAllegata[] => {
    const e = esiti[i].error;
    // 23505: la coppia preventivo-scheda c'è già (il primo tentativo era
    // passato e si era persa solo la risposta). La scheda è allegata.
    if (!e || e.code === "23505") return [];
    return [{ material_id: s.material_id, nome: s.nome?.trim() || null, errore: e }];
  });
}

/** «A» · «A» e «B» · null se un nome non si vede. */
function nomiTraVirgolette(schede: SchedaNonAllegata[]): string | null {
  if (schede.some((s) => !s.nome)) return null;
  const nomi = schede.map((s) => `«${s.nome}»`);
  return nomi.length === 1 ? nomi[0] : `${nomi.slice(0, -1).join(", ")} e ${nomi[nomi.length - 1]}`;
}

/**
 * Titolo e testo dell'avviso per le schede non allegate, o null se sono
 * entrate tutte. Il titolo lo completa chi chiama: «Preventivo creato in bozza: …».
 */
export function avvisoSchedeNonAllegate(
  nonAllegate: SchedaNonAllegata[],
): { conteggio: string; descrizione: string } | null {
  if (nonAllegate.length === 0) return null;
  const conteggio = nonAllegate.length === 1
    ? "una scheda tecnica non allegata"
    : `${nonAllegate.length} schede tecniche non allegate`;

  const diAltre = nonAllegate.filter((s) => eSchedaDiUnAltraAzienda(s.errore));
  const altre = nonAllegate.filter((s) => !eSchedaDiUnAltraAzienda(s.errore));
  const frasi: string[] = [];
  if (diAltre.length > 0) {
    // Si parla del file, non della scheda: chi salva vede solo le schede della
    // sua azienda, e il rifiuto che gli capita è quello del file rimasto nella
    // cartella di un'altra (una scheda copiata da un'azienda all'altra).
    const una = diAltre.length === 1;
    const nomi = nomiTraVirgolette(diAltre);
    const soggetto = una
      ? (nomi ? `Il file della scheda tecnica ${nomi}` : "Il file di una scheda tecnica")
      : (nomi ? `I file delle schede tecniche ${nomi}` : `I file di ${diAltre.length} schede tecniche`);
    frasi.push(`${soggetto} ${una ? "non è" : "non sono"} di questa azienda: ${una ? "non si può" : "non si possono"} allegare.`);
  }
  if (altre.length > 0) {
    const una = altre.length === 1;
    const nomi = nomiTraVirgolette(altre);
    const soggetto = una
      ? (nomi ? `La scheda tecnica ${nomi}` : "Una scheda tecnica")
      : (nomi ? `Le schede tecniche ${nomi}` : `${altre.length} schede tecniche`);
    frasi.push(`${soggetto} ${una ? "non è stata allegata" : "non sono state allegate"}. ${userErrorMessage(altre[0].errore)}`);
  }
  return { conteggio, descrizione: frasi.join(" ") };
}
