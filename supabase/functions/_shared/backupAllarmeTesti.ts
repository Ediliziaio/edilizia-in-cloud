/**
 * backupAllarmeTesti — le parole dell'avviso «aziende senza backup»: cosa
 * manca, da quanto, cosa fare. Logica pura (niente Deno, niente rete): la
 * usano il controllo del canarino e i test.
 *
 * Il titolare deve capire dall'oggetto, senza aprire l'email, quante aziende
 * sono scoperte e da quanto: «URGENTE — 14 aziende senza backup da 15 giorni».
 * Un'azienda che non è MAI stata salvata non ha giorni da contare, e si dice
 * con le sue parole: «mai salvate».
 *
 * Perché esiste: dal 15/11/2026 quattordici aziende sono rimaste senza copia
 * per quindici giorni mentre il rapporto del mattino lo diceva ogni mattina,
 * in una riga fra i segnali vitali della piattaforma. Il problema non era
 * accorgersene, era come lo diceva.
 */

/** Nell'email si elencano le prime, poi «e altre N»: cinquanta righe non si leggono. */
export const RIGHE_IN_EMAIL = 15;

export interface AziendaSenzaBackup {
  azienda: string;
  ultimo_backup: string | null;
  giorni_senza: number | null;
  nota: string;
}

export interface EsitoControllo {
  azione: "niente" | "avvisa" | "aspetta" | "risolto";
  allarme?: string;
  aziende?: number;
  giorni_peggiore?: number | null;
  elenco?: AziendaSenzaBackup[];
  primo?: boolean;
  avviso_numero?: number;
  aperto_il?: string;
  ore_aperto?: number;
  aziende_prima?: AziendaSenzaBackup[];
  avvisi_mandati?: number;
  prossimo_avviso?: string;
}

export interface EsitoBackupMancanti {
  azione: EsitoControllo["azione"];
  aziende: number;
  giorni_peggiore: number | null;
  avviso_inviato: boolean;
  oggetto: string | null;
  errori: string[];
  /** Solo con `anteprima`: l'avviso che sarebbe partito. */
  anteprima?: { oggetto: string; sommario: string; dettagli: Array<[string, string]> };
}

export const motivoErrore = (e: unknown) => (e instanceof Error ? e.message : String(e));

const quante = (n: number, una: string, tante: string) => (n === 1 ? `una ${una}` : `${n} ${tante}`);

/** «15 giorni (ultima copia il 2026-11-08)», oppure «mai salvata». */
export function quandoManca(riga: AziendaSenzaBackup): string {
  if (riga.giorni_senza == null || !riga.ultimo_backup) return "mai salvata";
  return `${riga.giorni_senza} giorni (ultima copia il ${riga.ultimo_backup})`;
}

/** L'avviso da spedire: oggetto che si legge dalla lista della posta, senza aprirlo. */
export function componiAvvisoBackup(
  elenco: AziendaSenzaBackup[],
  opzioni: { giorniPeggiore: number | null; avvisoNumero?: number },
): { oggetto: string; sommario: string; dettagli: Array<[string, string]> } {
  const n = elenco.length;
  const mai = elenco.filter((r) => r.giorni_senza == null || !r.ultimo_backup).length;
  const da = opzioni.giorniPeggiore != null
    ? ` da ${opzioni.giorniPeggiore} giorni`
    : mai > 0
    ? ", mai salvate"
    : "";
  const oggetto = `URGENTE — ${quante(n, "azienda", "aziende")} senza backup${da}`;
  const sommario = n === 1
    ? `${elenco[0].azienda} non ha una copia dei suoi dati. Il giro notturno del backup non l'ha salvata: finché resta così, un errore o una cancellazione non si possono annullare.`
    : `${n} aziende non hanno una copia dei loro dati. Il giro notturno del backup non le ha salvate: finché restano così, un errore o una cancellazione non si possono annullare.`;

  const dettagli: Array<[string, string]> = elenco
    .slice(0, RIGHE_IN_EMAIL)
    .map((r): [string, string] => [r.azienda, quandoManca(r)]);
  if (n > RIGHE_IN_EMAIL) dettagli.push(["e altre", `${n - RIGHE_IN_EMAIL} aziende`]);
  if (mai > 0) dettagli.push(["Mai salvate", `${mai} su ${n}`]);
  if (opzioni.avvisoNumero && opzioni.avvisoNumero > 1) {
    dettagli.push(["Promemoria", `${opzioni.avvisoNumero}° avviso: non è ancora risolto`]);
  }
  dettagli.push([
    "Cosa fare",
    "Scheda azienda → Lifecycle → Backup per salvarla adesso, o rilanciare company-backup. Se si ripete ogni notte, il giro non arriva in fondo.",
  ]);
  return { oggetto, sommario, dettagli };
}

/** Quando torna a posto si dice: il silenzio non prova niente. */
export function componiRipristinoBackup(
  esito: EsitoControllo,
): { oggetto: string; sommario: string; dettagli: Array<[string, string]> } {
  const prima = esito.aziende_prima ?? [];
  const dettagli: Array<[string, string]> = [
    ["Aziende rimesse a posto", String(prima.length)],
    ["Allarme aperto per", esito.ore_aperto != null ? `${esito.ore_aperto} ore` : "poco"],
    ["Avvisi mandati", String(esito.avvisi_mandati ?? 0)],
  ];
  if (prima.length > 0) {
    dettagli.push(["Erano", prima.slice(0, RIGHE_IN_EMAIL).map((r) => r.azienda).join(", ")]);
  }
  return {
    oggetto: "Risolto — tutte le aziende hanno un backup",
    sommario: "Il controllo non trova più aziende senza copia: l'allarme si chiude.",
    dettagli,
  };
}

