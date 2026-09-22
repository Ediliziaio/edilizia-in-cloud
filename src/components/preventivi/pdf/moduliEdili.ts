/**
 * Le parole di ogni mestiere: l'unica cosa che cambia fra gli otto moduli edili.
 *
 * Stanno qui, in un posto solo, perché le leggono in due: l'adattatore del PDF e
 * l'anteprima di copertina dell'editor. Se il titolo di serie cambia, cambia in
 * tutti e due insieme (un'anteprima che mostra una cosa e un PDF che ne stampa
 * un'altra è il guaio che si vuole evitare).
 *
 * Nei titoli una parola fra asterischi esce in corsivo. Niente promesse di serie
 * («chiavi in mano», «senza pensieri»): le fa l'azienda, se le mantiene.
 */
import type { DocEdileModulo } from "./documentoEdileTipi";

export type ChiaveModuloEdile =
  | "ristrutturazione" | "bagni" | "tetti" | "climatizzazione"
  | "elettrico" | "termoidraulico" | "pavimenti" | "piscine";

export const MODULI_EDILI: Record<ChiaveModuloEdile, DocEdileModulo> = {
  ristrutturazione: {
    chiave: "ristrutturazione", etichetta: "Ristrutturazione",
    titoloCopertina: "Il *progetto* per la tua casa.",
    sottotitoloCopertina: "I lavori per la tua casa, voce per voce",
    titoloComputo: "Il piano dei lavori",
  },
  bagni: {
    chiave: "bagni", etichetta: "Bagno",
    titoloCopertina: "Il tuo *bagno*, come lo vuoi.",
    sottotitoloCopertina: "I lavori per il tuo bagno nuovo, voce per voce",
    titoloComputo: "Il piano dei lavori",
  },
  tetti: {
    chiave: "tetti", etichetta: "Tetto",
    titoloCopertina: "Un *tetto* nuovo sopra la tua casa.",
    sottotitoloCopertina: "I lavori per la copertura, voce per voce",
    titoloComputo: "Il piano dei lavori",
  },
  climatizzazione: {
    chiave: "climatizzazione", etichetta: "Climatizzazione",
    titoloCopertina: "Il *clima* giusto, in ogni stanza.",
    sottotitoloCopertina: "Il tuo impianto di climatizzazione, voce per voce",
    titoloComputo: "Il piano dei lavori",
  },
  elettrico: {
    chiave: "elettrico", etichetta: "Impianto elettrico",
    titoloCopertina: "Il tuo *impianto*, a regola d'arte.",
    sottotitoloCopertina: "L'impianto elettrico, voce per voce",
    titoloComputo: "Il piano dei lavori",
  },
  termoidraulico: {
    chiave: "termoidraulico", etichetta: "Termoidraulica",
    titoloCopertina: "Il *comfort* di casa tua.",
    sottotitoloCopertina: "L'impianto termoidraulico, voce per voce",
    titoloComputo: "Il piano dei lavori",
  },
  pavimenti: {
    chiave: "pavimenti", etichetta: "Pavimenti",
    titoloCopertina: "I tuoi *pavimenti*, posati ad arte.",
    sottotitoloCopertina: "Pavimenti e rivestimenti, voce per voce",
    titoloComputo: "Il piano dei lavori",
  },
  piscine: {
    chiave: "piscine", etichetta: "Piscina",
    titoloCopertina: "La tua *piscina*, dal progetto al primo tuffo.",
    sottotitoloCopertina: "La tua piscina, voce per voce",
    titoloComputo: "Il piano dei lavori",
  },
};
