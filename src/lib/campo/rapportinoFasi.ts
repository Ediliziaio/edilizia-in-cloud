/**
 * Materiali e foto di un rapportino legati alla fase su cui si è lavorato.
 *
 * Il rapportino è di un lavoro (la commessa) e di una giornata; dentro ci sono le fasi su cui si è
 * lavorato. Materiali e foto restano nelle liste di sempre (`materiali_usati`, `foto_urls`: le leggono
 * l'ufficio, il PDF, Silvio, WhatsApp) e in più dicono a quale fase appartengono:
 *   · `materiali_usati[].fase_id`;
 *   · `fasi_lavorate[].foto` (indirizzi, sottoinsieme di `foto_urls`).
 *
 * Regole, pensate per non aggiungere un gesto a chi lavora su una fase sola (il caso di tutti i giorni):
 *   · con UNA fase dichiarata, tutto ciò che non ha una fase scelta si collega a quella;
 *   · con PIÙ fasi si collega solo ciò che l'operaio ha assegnato (menu «Fase» accanto a materiali e
 *     foto): il resto resta generale, senza indovinare;
 *   · una fase tolta dall'elenco scioglie i suoi collegamenti: finiscono tra le cose generali (se resta una
 *     fase sola, passano a quella).
 */
// Un `type` e non un'interface: finisce in una colonna jsonb, e solo un type letterale è assegnabile a `Json`.
export type FaseLavorataRapportino = {
  phase_id: string;
  percentuale: number;
  /** Solo per le fasi con sottofasi: quelle spuntate in questo rapportino (le scrive `fasiLavorateDelRapportino`). */
  sottofasi_fatte?: string[];
  /** Il nome com'era al momento del rapportino: resta leggibile anche se la fase viene rinominata. */
  nome: string;
  foto?: string[];
};

/** La fase a cui va un materiale o una foto, o null se resta generale. */
export function faseDiAppartenenza(faseScelta: string | undefined | null, dichiarate: string[]): string | null {
  if (faseScelta && dichiarate.includes(faseScelta)) return faseScelta;
  return dichiarate.length === 1 ? dichiarate[0] : null;
}

export function costruisciFasiLavorate(input: {
  /** phase_id → avanzamento dichiarato (nell'ordine in cui sono state toccate). */
  dichiarate: Record<string, number>;
  /** phase_id → nome attuale della fase. */
  nomi: Record<string, string>;
  fotoUrls: string[];
  /** indirizzo della foto → phase_id scelto dall'operaio. */
  fotoFase: Record<string, string>;
  /**
   * Le voci già costruite altrove (per le fasi con sottofasi: `sottofasi_fatte` e l'avanzamento che ne deriva,
   * vedi `fasiLavorateDelRapportino`): si tengono così come sono, e si aggiungono nome e foto.
   */
  base?: ReadonlyArray<{ phase_id: string; percentuale: number; sottofasi_fatte?: string[] }>;
}): FaseLavorataRapportino[] {
  const voci = input.base ?? Object.entries(input.dichiarate).map(([phase_id, percentuale]) => ({ phase_id, percentuale }));
  const ids = voci.map(v => v.phase_id);
  return voci.map(voce => {
    const foto = input.fotoUrls.filter(u => faseDiAppartenenza(input.fotoFase[u], ids) === voce.phase_id);
    return {
      ...voce,
      nome: input.nomi[voce.phase_id] ?? "",
      ...(foto.length ? { foto } : {}),
    };
  });
}
