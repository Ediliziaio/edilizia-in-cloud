/**
 * Quando l'eliminazione di contatti va fatta scrivere, e cosa va scritto.
 *
 * Il dialogo chiedeva di scrivere CONFERMA solo se il contatto aveva record
 * collegati. Sembra ragionevole finché non si guarda il caso peggiore reale:
 * un'anagrafica fredda importata in blocco NON ha opportunità, preventivi né
 * task collegati. Quindi selezionare cinquemila contatti e premere Elimina
 * chiedeva un clic solo — e il dialogo per giunta rassicurava, «nessun record
 * collegato: si elimina solo l'anagrafica».
 *
 * La quantità è un pericolo quanto i collegamenti. Sopra la soglia si scrive
 * il NUMERO, non una parola fissa: una parola si digita a memoria senza
 * leggere, un numero costringe a guardare quanti sono.
 */

/** Da quanti contatti in su l'eliminazione va scritta invece che cliccata. */
export const SOGLIA_ELIMINAZIONE_MASSIVA = 10;

/** La parola fissa per il caso «pochi contatti, ma con collegamenti». */
export const PAROLA_CONFERMA = "CONFERMA";

export interface CollegamentiContatti {
  opportunities: number;
  appointments: number;
  quotes: number;
  tasks: number;
}

export function totaleCollegamenti(l: CollegamentiContatti): number {
  return l.opportunities + l.appointments + l.quotes + l.tasks;
}

export interface RichiestaConferma {
  /** Se false si conferma col solo pulsante. */
  serve: boolean;
  /** Cosa va scritto per sbloccare il pulsante. */
  parola: string;
  /** Perché viene chiesto: decide il testo mostrato. */
  motivo: "quantita" | "collegamenti" | "nessuno";
}

/**
 * `links` null significa che il conteggio è ancora in corso: in quel caso la
 * quantità decide da sola, senza aspettare — se sono tanti lo sono comunque.
 */
export function richiestaConferma(
  count: number,
  links: CollegamentiContatti | null,
): RichiestaConferma {
  if (count >= SOGLIA_ELIMINAZIONE_MASSIVA) {
    return { serve: true, parola: String(count), motivo: "quantita" };
  }
  if (links && totaleCollegamenti(links) > 0) {
    return { serve: true, parola: PAROLA_CONFERMA, motivo: "collegamenti" };
  }
  return { serve: false, parola: "", motivo: "nessuno" };
}

/** Il testo scritto combacia con quello richiesto? */
export function confermaValida(testo: string, richiesta: RichiestaConferma): boolean {
  if (!richiesta.serve) return true;
  return testo.trim().toUpperCase() === richiesta.parola.toUpperCase();
}
