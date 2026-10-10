/**
 * La frase da mostrare quando, nelle impostazioni, un'azione non è riuscita.
 *
 * Prima ogni avviso mostrava `err.message` com'era: «Failed to fetch», «JSON object requested, multiple (or no) rows
 * returned», i testi del database. Chi lavora in ufficio non sa cosa farne. Qui un errore diventa una frase che dice
 * cosa non è riuscito e, quando si sa, perché:
 * - i casi che l'app conosce (rete, timeout, sessione scaduta, permessi, vincoli) hanno la loro frase (`userErrorMessage`);
 * - un messaggio scritto apposta da noi («Troppe righe in un singolo batch (max 5000)») si legge com'è;
 * - un testo di una libreria o del browser no: si dice solo di riprovare.
 */
import { sembraErrorePostgresGrezzo, userErrorMessage } from "@/lib/userErrorMessage";

/** Testo di una libreria o del browser, non scritto per chi lavora: «Cannot read properties of undefined», «PGRST…». */
function sembraTestoTecnico(testo: string): boolean {
  return (
    /^[A-Za-z]*Error\b/.test(testo) ||
    /\b(undefined|cannot|could not|failed|unexpected|not a function|object requested|reading '|PGRST\d+)/i.test(testo) ||
    // Frasi inglesi di funzioni, server e librerie che non hanno una parola «tecnica» riconoscibile.
    /\b(non-2xx|status code|edge function|bad request|not found|does not exist|invalid|unsupported|required|too large|gateway|forbidden|unauthori[sz]ed|zip file|central directory)\b/i.test(testo) ||
    // Contrazioni inglesi («Can't read…») e indirizzi web: un messaggio scritto da noi non ne ha.
    /\b[a-z]+n't\b/i.test(testo) ||
    /https?:\/\//i.test(testo) ||
    sembraErrorePostgresGrezzo(testo)
  );
}

/**
 * @param errore ciò che è stato catturato
 * @param nonRiuscito cosa non è andato a buon fine, già con il punto: «Importazione non riuscita.». Vuoto = solo il perché
 *   (per la descrizione di un avviso che ha già il suo titolo).
 */
export function testoErrore(errore: unknown, nonRiuscito = ""): string {
  const prima = nonRiuscito ? `${nonRiuscito} ` : "";

  // Una modifica che il database ignora senza errore (permesso mancante, riga sparita) con `.single()` arriva così.
  if (String((errore as { code?: unknown } | null)?.code ?? "") === "PGRST116") {
    return `${prima}Non è stato cambiato niente: forse non hai il permesso, o l'elemento non esiste più.`;
  }

  const noto = userErrorMessage(errore, "");
  if (noto) return `${prima}${noto}`;

  // Anche un oggetto semplice con un `message` (non solo un `Error`): senza questo il messaggio scritto da noi si perde.
  const messaggioOggetto = (errore as { message?: unknown } | null)?.message;
  const testo =
    errore instanceof Error ? errore.message.trim()
    : typeof errore === "string" ? errore.trim()
    : typeof messaggioOggetto === "string" ? messaggioOggetto.trim()
    : "";
  if (testo && !sembraTestoTecnico(testo)) return testo;

  return `${prima}Riprova tra poco.`;
}
