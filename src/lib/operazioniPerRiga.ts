import { isNetworkError, isTransientTimeoutError, sembraErrorePostgresGrezzo, userErrorMessage } from "@/lib/userErrorMessage";

export interface EsitoPerRiga<T> { completate: T[]; errori: Array<{ riga: T; motivo: string }> }

export function messaggioErroreOperazione(errore: unknown, fallback = "Operazione non riuscita. Riprova."): string {
  const msg = (errore as { message?: unknown } | null)?.message;
  if (typeof msg === "string" && /^(La |Questa |Il |Non |È |Serve |Solo |Scrittura |Scadenza |Registrazione |Pagamento |Controlla |Accedi |Scegli |Un |Una )/.test(msg)
      && !sembraErrorePostgresGrezzo(msg) && !isNetworkError(errore) && !isTransientTimeoutError(errore)) return msg;
  return userErrorMessage(errore, fallback);
}

/** Ogni azione è atomica nel server; un errore non nasconde le righe già elaborate. */
export async function eseguiPerRiga<T>(righe: readonly T[], azione: (riga: T) => Promise<unknown>): Promise<EsitoPerRiga<T>> {
  const esito: EsitoPerRiga<T> = { completate: [], errori: [] };
  for (let i = 0; i < righe.length; i++) {
    const riga = righe[i];
    try {
      await azione(riga);
      esito.completate.push(riga);
    } catch (errore) {
      esito.errori.push({ riga, motivo: messaggioErroreOperazione(errore) });
      if (isNetworkError(errore)) {
        esito.errori.push(...righe.slice(i + 1).map((r) => ({ riga: r, motivo: "Non elaborata: connessione interrotta." })));
        break;
      }
    }
  }
  return esito;
}
