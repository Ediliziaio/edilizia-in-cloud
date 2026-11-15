/**
 * Impostazioni → Automazioni: l'elenco degli automatismi dell'azienda (decisione del titolare, 15/11/2026).
 *
 * Una riga per automatismo: cosa fa, se è acceso o spento, l'ultimo controllo o esito.
 * Per aggiungerne uno (Tesoreria, Subappalti, Rapportini…) si aggiunge UN elemento ad
 * `AUTOMATISMI` qui sotto, con i due hook che lo descrivono. Niente pagine nuove, niente
 * interruttori sparsi altrove. Istruzioni complete: docs/automazioni-acquisti.md §3.
 */
import type { ComponentType } from "react";
import { useCollegamentoAutomatico, useSalvaCollegamentoAutomatico } from "@/hooks/useCollegamentoAutomatico";
import { VerificaCollegamentiDialog } from "@/components/acquisti/VerificaCollegamentiDialog";
import { useUltimoCollegamento } from "@/hooks/useUltimoCollegamento";
import { useUltimoCollegamentoSubappalti } from "@/hooks/useUltimoCollegamentoSubappalti";
import { useUltimoEsitoBollette } from "@/hooks/useUltimoEsitoBollette";
import { useUltimoEsitoTesoreria } from "@/hooks/useUltimoEsitoTesoreria";

/** Lo stato dell'interruttore, letto dal server. */
export interface StatoAutomatismo {
  acceso: boolean;
  caricamento: boolean;
  /** Salva il nuovo valore. Chi può farlo lo decide il database; la pagina lo blocca a chi non amministra. */
  cambia: (acceso: boolean) => void;
  salvataggio: boolean;
}

/** L'ultimo controllo o esito: cosa ha fatto l'automatismo l'ultima volta, o cosa aspetta. */
export interface UltimoEsito {
  /** ISO, se c'è una data. */
  quando: string | null;
  testo: string;
  tono: "neutro" | "ok" | "attenzione" | "errore";
}

export interface Automatismo {
  /** Stabile nel tempo: serve ai test e agli indirizzi (#id). */
  id: string;
  /** L'area che lo possiede: Acquisti, Tesoreria, Subappalti, Rapportini… */
  area: string;
  titolo: string;
  /** Cosa fa, in una o due frasi da cantiere. */
  cosaFa: string;
  /** Cosa succede se resta spento (di base tutti nascono spenti, salvo decisione diversa del titolare). */
  daSpento: string;
  useStato: (companyId: string) => StatoAutomatismo;
  /** Facoltativo: senza, la riga dice «nessun esito registrato». */
  useUltimoEsito?: (companyId: string) => UltimoEsito | null | undefined;
  /**
   * Facoltativo: un'azione sotto l'ultimo esito (es. aprire le proposte da confermare).
   * `puoModificare` = l'utente può confermare/annullare; il database lo ricontrolla comunque.
   */
  Azione?: ComponentType<{ companyId: string; puoModificare: boolean }>;
}

/**
 * L'interruttore comune del collegamento automatico. Gli automatismi che lo seguono (tesoreria,
 * subappalti…) usano questo stesso `useStato`: l'interruttore resta uno solo.
 */
export function useStatoCollegamento(companyId: string): StatoAutomatismo {
  const { data = false, isLoading } = useCollegamentoAutomatico(companyId);
  const salva = useSalvaCollegamentoAutomatico(companyId);
  return { acceso: data, caricamento: isLoading, cambia: (v) => salva.mutate(v), salvataggio: salva.isPending };
}

export const AUTOMATISMI: Automatismo[] = [
  {
    id: "collegamento-documenti",
    area: "Tutti i collegamenti",
    titolo: "Collegamento automatico dei documenti",
    cosaFa:
      "Quando un collegamento è certo — un solo documento possibile e tutti i dati che tornano (stesso fornitore, stesso numero di bolla, data vicina…) — lo fa da solo. Vale per fatture, bolle, ordini, commesse, pagamenti e subappalti.",
    daSpento: "Da spento il collegamento certo ti viene proposto e lo confermi con un clic. Quando c'è un dubbio ti chiede sempre, acceso o spento.",
    useStato: useStatoCollegamento,
    useUltimoEsito: useUltimoCollegamento,
    Azione: VerificaCollegamentiDialog,
  },
  {
    id: "subappalti-fattura-contratto-sal",
    area: "Subappalti",
    titolo: "Fattura del subappaltatore al suo contratto e SAL",
    cosaFa:
      "Quando arriva la fattura di un subappaltatore la collega al suo contratto e al SAL, se è certo: stessa partita IVA, SAL citato in fattura e già verificato, importo uguale al SAL (al periodo o al netto, con l'acconto già scalato). Lo fa un giro del server, senza AI. Segue l'interruttore del collegamento automatico.",
    daSpento:
      "Da spento la fattura ti viene proposta nella sua scheda e la colleghi con un clic. Una fattura sul cumulativo, oltre il contratto o su un SAL già fatturato non si collega mai da sola.",
    useStato: useStatoCollegamento,
    useUltimoEsito: useUltimoCollegamentoSubappalti,
  },
  {
    id: "incassi-giroconti-banca",
    area: "Tesoreria",
    titolo: "Incassi e giroconti dalla banca",
    cosaFa:
      "Quando un bonifico in entrata salda una fattura emessa senza dubbi — stesso cliente o IBAN verificato, numero e anno della fattura nella causale, importo uguale al residuo — registra l'incasso da solo. Fa lo stesso per i giroconti fra due conti dell'azienda. Segue l'interruttore del collegamento automatico.",
    daSpento: "Da spento il movimento certo ti viene proposto in tesoreria e lo confermi con un clic. Parziali, cumulativi e casi dubbi li decidi sempre tu.",
    useStato: useStatoCollegamento,
    useUltimoEsito: useUltimoEsitoTesoreria,
  },
  {
    id: "bollette-utenze",
    area: "Bollette",
    titolo: "Bollette di luce e gas: utenza e commessa",
    cosaFa:
      "Un giro del server legge le bollette arrivate: riconosce l'utenza dal POD o dal PDR (non dall'indirizzo), il periodo e l'importo, e distingue un doppione da un conguaglio o da una nota di credito. Se l'utenza è collegata a una commessa, ci mette il costo. Senza AI. Segue l'interruttore del collegamento automatico.",
    daSpento:
      "Da spento le bollette si leggono lo stesso, ma la commessa ti viene proposta e la confermi con un clic. Un possibile doppione non va mai sui costi finché non decidi tu (Costi → Utenze).",
    useStato: useStatoCollegamento,
    useUltimoEsito: useUltimoEsitoBollette,
  },
];
