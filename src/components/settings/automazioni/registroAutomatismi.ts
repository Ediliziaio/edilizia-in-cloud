/**
 * Impostazioni → Automazioni: l'elenco degli automatismi dell'azienda (decisione del titolare, 15/11/2026).
 *
 * Una riga per automatismo: cosa fa, se è acceso o spento, l'ultimo controllo o esito.
 * Per aggiungerne uno (Tesoreria, Subappalti, Rapportini…) si aggiunge UN elemento ad
 * `AUTOMATISMI` qui sotto, con i due hook che lo descrivono. Niente pagine nuove, niente
 * interruttori sparsi altrove. Istruzioni complete: docs/automazioni-acquisti.md §3.
 */
import { useCollegamentoAutomatico, useSalvaCollegamentoAutomatico } from "@/hooks/useCollegamentoAutomatico";
import { useUltimoCollegamento } from "@/hooks/useUltimoCollegamento";
import { useUltimoCollegamentoSubappalti } from "@/hooks/useUltimoCollegamentoSubappalti";

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
}

/** L'interruttore comune: le righe che lo seguono lo riusano, così resta uno solo. */
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
  },
  {
    id: "subappalti-fattura-contratto-sal",
    area: "Subappalti",
    titolo: "Fattura del subappaltatore al suo contratto e SAL",
    cosaFa:
      "Quando arriva la fattura di un subappaltatore la collega al suo contratto e al SAL, se è certo: stessa partita IVA, SAL citato in fattura e già verificato, importo uguale al netto del SAL (acconto già scalato). Ogni 15 minuti, senza AI. Segue l'interruttore del collegamento automatico.",
    daSpento:
      "Da spento la fattura ti viene proposta nella sua scheda e la colleghi con un clic. Una fattura sul cumulativo, oltre il contratto o su un SAL già fatturato non si collega mai da sola.",
    useStato: useStatoCollegamento,
    useUltimoEsito: useUltimoCollegamentoSubappalti,
  },
];
