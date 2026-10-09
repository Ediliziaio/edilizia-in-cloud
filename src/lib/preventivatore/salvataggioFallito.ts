/**
 * Quando il salvataggio di un preventivo non riesce: il perché, in italiano, e l'avviso.
 *
 * Prima i wizard dei preventivi scrivevano nel toast il testo grezzo dell'errore («TypeError: Failed to fetch»,
 * «new row violates row-level security policy…»): chi lavora in cantiere, senza rete, leggeva inglese tecnico, e
 * non sapeva né perché né cosa fare. Qui i testi sono quelli dell'app (`userErrorMessage`), e dalla freccia «Esci»
 * si può uscire comunque: se il salvataggio viene rifiutato SEMPRE (account bloccato, permesso tolto) la freccia, che
 * esce solo a salvataggio riuscito, non lascerebbe più uscire dal preventivo.
 */
import { toast } from "sonner";
import { sembraErrorePostgresGrezzo, userErrorMessage } from "@/lib/userErrorMessage";

const GENERICO = "Il salvataggio non è andato a buon fine.";

/** Testo di una libreria o del browser, non scritto per chi lavora: «Cannot read properties of undefined», «JSON object requested…». */
function sembraTestoTecnico(testo: string): boolean {
  return (
    /^[A-Za-z]*Error\b/.test(testo) ||
    /\b(undefined|cannot|could not|failed|unexpected|not a function|object requested|reading '|PGRST\d+)/i.test(testo) ||
    sembraErrorePostgresGrezzo(testo)
  );
}

/**
 * Perché un salvataggio non è riuscito, in italiano e senza gergo. I casi che l'app conosce (rete, timeout, sessione,
 * permessi, vincoli) hanno la loro frase; un messaggio scritto apposta per chi lavora (un controllo del wizard, un
 * trigger del database, già in italiano) si legge com'è; un testo tecnico no.
 */
export function motivoSalvataggioNonRiuscito(errore: unknown): string {
  const noto = userErrorMessage(errore, "");
  if (noto) return noto;
  const testo = errore instanceof Error ? errore.message.trim() : "";
  return testo && !sembraTestoTecnico(testo) ? testo : GENERICO;
}

export interface OpzioniAvviso {
  /** Dalla freccia «Esci»: esce lo stesso, senza il salvataggio. Se c'è, l'avviso offre «Esci comunque». */
  esciComunque?: () => void;
  /** Le modifiche non salvate restano in una copia di recupero su questo dispositivo (Serramenti): l'avviso lo dice. */
  conCopiaDiRecupero?: boolean;
}

/** Il durare dell'avviso con «Esci comunque»: il tempo di leggerlo e decidere. */
const DURATA_CON_AZIONE_MS = 20_000;

/**
 * Un solo avviso «Salvataggio fallito» alla volta: chi lo mostra per primo (la mutation) e chi lo arricchisce poi con «Esci comunque»
 * (la freccia) usano questo id, e sonner sostituisce il primo col secondo invece di impilarli.
 */
export const ID_AVVISO_SALVATAGGIO_FALLITO = "salvataggio-fallito";

/**
 * L'avviso quando un salvataggio che chi lavora ha chiesto (Avanti, cambio di passo, freccia «Esci») non riesce.
 * Si resta nel preventivo, con le modifiche; dalla freccia, in più, «Esci comunque» (mai un'uscita in silenzio).
 */
export function avvisaSalvataggioFallito(errore: unknown, { esciComunque, conCopiaDiRecupero }: OpzioniAvviso = {}): void {
  const resta = "Sei ancora nel preventivo: le modifiche non sono perse.";
  const seEsci = !esciComunque
    ? ""
    : conCopiaDiRecupero
      ? " Se esci comunque restano in una copia di recupero su questo dispositivo."
      : " Se esci comunque le ultime modifiche potrebbero andare perse.";
  toast.error("Salvataggio fallito", {
    id: ID_AVVISO_SALVATAGGIO_FALLITO,
    description: `${motivoSalvataggioNonRiuscito(errore)} ${resta}${seEsci}`,
    ...(esciComunque ? { action: { label: "Esci comunque", onClick: esciComunque }, duration: DURATA_CON_AZIONE_MS } : {}),
  });
}
