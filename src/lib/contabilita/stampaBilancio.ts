/**
 * Conto economico e Stato patrimoniale da stampare (09/11/2026).
 *
 * Nel Controllo di Gestione i due prospetti si scaricano in Excel e finiscono
 * nel «Pacchetto banca», che però è un documento per la banca. Chi voleva
 * semplicemente stampare il bilancio e portarlo al commercialista non aveva
 * un foglio.
 *
 * Due cose che questo modulo non nasconde:
 * - è un bilancio **riclassificato gestionale**, non il bilancio civilistico
 *   (art. 2424 e 2425): voci e ordine sono quelli che servono a leggere
 *   l'azienda, non quelli del deposito;
 * - se lo stato patrimoniale **non quadra**, lo dice in testa al foglio con
 *   la differenza, invece di stampare due colonne che non tornano e lasciare
 *   che se ne accorga il commercialista.
 */
import {
  htmlDocumentoContabile,
  type AziendaIntestazione,
} from "./documentoContabile";

export interface VoceBilancio {
  codice?: string;
  label: string;
  valore: number;
  /** Subtotali e totali: in grassetto, con la riga sopra. */
  forte?: boolean;
}

const euro = (n: number): string =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    useGrouping: "always",
  }).format(n);

/**
 * «-37,5%», con la virgola. Scritta a mano con `Math.round` veniva «-37.5%»:
 * su un prospetto contabile italiano il punto decimale stona, e in una colonna
 * di numeri si nota subito.
 */
const percentuale = (n: number): string =>
  `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(n)}%`;

/** «meno di un euro» invece di «0,004 €»: una differenza che non si vede. */
export function differenzaLeggibile(d: number): string {
  return Math.abs(d) < 1 ? "meno di un euro" : euro(Math.abs(d));
}

const AVVISO_GESTIONALE =
  "Prospetto riclassificato per la lettura dell'azienda: le voci e il loro ordine non sono quelli del bilancio civilistico da depositare.";

/** Il conto economico riclassificato, una voce per riga. */
export function htmlContoEconomico(d: {
  azienda: AziendaIntestazione;
  voci: readonly VoceBilancio[];
  anno: number;
  /** «gennaio – marzo» quando non è l'anno intero. */
  mesi?: string | null;
  /** Le imposte sono una stima: va detto sul foglio, non a voce. */
  aliquotaImposte?: number | null;
}): string {
  const periodo = d.mesi ? `Esercizio ${d.anno} · ${d.mesi}` : `Esercizio ${d.anno}`;
  const ricavi = d.voci.find((v) => /ricavi/i.test(v.label))?.valore ?? 0;
  return htmlDocumentoContabile<VoceBilancio>({
    titolo: "Conto economico riclassificato",
    periodo,
    sottotitolo: [
      AVVISO_GESTIONALE,
      d.aliquotaImposte != null
        ? `Le imposte sono una stima al ${d.aliquotaImposte}%: quelle vere le calcola il commercialista.`
        : "",
    ].filter(Boolean).join(" "),
    azienda: d.azienda,
    riepilogo: ricavi
      ? [{ etichetta: "Ricavi del periodo", valore: euro(ricavi) }]
      : undefined,
    colonne: [
      { intestazione: "Voce", valore: (v) => v.label, larghezza: "62%" },
      { intestazione: "Importo", valore: (v) => euro(v.valore), allinea: "destra", compatta: true, larghezza: "24%" },
      {
        intestazione: "% ricavi",
        valore: (v) => (ricavi ? percentuale((v.valore / ricavi) * 100) : ""),
        allinea: "destra",
        compatta: true,
        larghezza: "14%",
      },
    ],
    righe: d.voci,
    evidenzia: (v) => !!v.forte,
    vuoto: "Nessun dato per questo esercizio.",
  });
}

/**
 * Lo stato patrimoniale, attivo e passivo uno sotto l'altro con la colonna
 * della sezione: su A4 due colonne affiancate costringono a caratteri da
 * lente d'ingrandimento.
 */
export function htmlStatoPatrimoniale(d: {
  azienda: AziendaIntestazione;
  attivo: readonly VoceBilancio[];
  passivo: readonly VoceBilancio[];
  anno: number;
  dataRiferimento?: string | null;
  quadratura: { differenza: number; quadrato: boolean };
}): string {
  type Riga = VoceBilancio & { sezione: string };
  const righe: Riga[] = [
    ...d.attivo.map((v) => ({ ...v, sezione: "Attivo" })),
    ...d.passivo.map((v) => ({ ...v, sezione: "Passivo" })),
  ];
  const totaleAttivo = d.attivo.find((v) => /^totale/i.test(v.label))?.valore ?? 0;
  const totalePassivo = d.passivo.find((v) => /^totale/i.test(v.label))?.valore ?? 0;

  return htmlDocumentoContabile<Riga>({
    titolo: "Stato patrimoniale riclassificato",
    periodo: d.dataRiferimento
      ? `Al ${d.dataRiferimento.slice(8, 10)}/${d.dataRiferimento.slice(5, 7)}/${d.dataRiferimento.slice(0, 4)}`
      : `Esercizio ${d.anno}`,
    sottotitolo: d.quadratura.quadrato
      ? AVVISO_GESTIONALE
      : `${AVVISO_GESTIONALE} ATTENZIONE: attivo e passivo non quadrano, differenza di ${differenzaLeggibile(d.quadratura.differenza)}. Prima di consegnarlo, controlla le voci che il gestionale non conosce (crediti tributari, anticipi, cassa contanti, debiti verso il personale).`,
    azienda: d.azienda,
    riepilogo: [
      { etichetta: "Totale attivo", valore: euro(totaleAttivo) },
      { etichetta: "Totale passivo", valore: euro(totalePassivo) },
      {
        etichetta: "Quadratura",
        valore: d.quadratura.quadrato ? "Quadra" : `Differenza ${differenzaLeggibile(d.quadratura.differenza)}`,
      },
    ],
    colonne: [
      { intestazione: "Sezione", valore: (v) => v.sezione, compatta: true, larghezza: "12%" },
      { intestazione: "Voce", valore: (v) => v.label, larghezza: "60%" },
      { intestazione: "Importo", valore: (v) => euro(v.valore), allinea: "destra", compatta: true, larghezza: "28%" },
    ],
    righe,
    evidenzia: (v) => !!v.forte,
    vuoto: "Nessun dato per questo esercizio.",
  });
}

/** Le voci dello stato patrimoniale in righe leggibili, nell'ordine giusto. */
export function vociAttivo(a: Record<string, number>): VoceBilancio[] {
  return [
    { label: "Immobilizzazioni immateriali", valore: a.imm_immateriali ?? 0 },
    { label: "Immobilizzazioni materiali", valore: a.imm_materiali ?? 0 },
    { label: "Immobilizzazioni finanziarie", valore: a.imm_finanziarie ?? 0 },
    { label: "Attivo fisso", valore: a.attivo_fisso ?? 0, forte: true },
    { label: "Rimanenze di magazzino", valore: a.rimanenze ?? 0 },
    { label: "Crediti verso clienti", valore: a.crediti_clienti ?? 0 },
    { label: "Crediti tributari", valore: a.crediti_tributari ?? 0 },
    { label: "Anticipi a fornitori", valore: a.anticipi_fornitori ?? 0 },
    { label: "Liquidità differite", valore: a.liquidita_differite ?? 0, forte: true },
    { label: "Cassa", valore: a.cassa ?? 0 },
    { label: "Banche attive", valore: a.banche_positive ?? 0 },
    { label: "Liquidità immediate", valore: a.liquidita_immediate ?? 0, forte: true },
    { label: "Attivo circolante", valore: a.attivo_circolante ?? 0, forte: true },
    { label: "Totale attivo", valore: a.totale ?? 0, forte: true },
  ];
}

export function vociPassivo(p: Record<string, number>): VoceBilancio[] {
  return [
    { label: "Capitale sociale", valore: p.capitale_sociale ?? 0 },
    { label: "Riserve", valore: p.riserve ?? 0 },
    { label: "Utile dell'esercizio", valore: p.utile_esercizio ?? 0 },
    ...(p.rettifica_patrimoniale
      ? [{ label: "Rettifica patrimoniale", valore: p.rettifica_patrimoniale }]
      : []),
    { label: "Mezzi propri", valore: p.mezzi_propri ?? 0, forte: true },
    { label: "Fondo TFR", valore: p.fondo_tfr ?? 0 },
    { label: "Fondi rischi", valore: p.fondi_rischi ?? 0 },
    { label: "Mutui a medio-lungo termine", valore: p.mutui_mlt ?? 0 },
    { label: "Passivo consolidato", valore: p.pas_consolidato ?? 0, forte: true },
    { label: "Banche passive", valore: p.banche_negative ?? 0 },
    { label: "Debiti verso fornitori", valore: p.debiti_fornitori ?? 0 },
    { label: "Debiti tributari", valore: p.debiti_tributari ?? 0 },
    { label: "Debiti verso il personale", valore: p.debiti_personale ?? 0 },
    { label: "Debiti previdenziali", valore: p.debiti_previdenziali ?? 0 },
    { label: "Passivo corrente", valore: p.pas_corrente ?? 0, forte: true },
    { label: "Totale passivo", valore: p.totale ?? 0, forte: true },
  ];
}
