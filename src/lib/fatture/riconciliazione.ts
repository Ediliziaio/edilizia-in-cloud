/**
 * Riconciliazione fatture ↔ commesse (e importi).
 *
 * Chi fattura da un gestionale esterno (Fatture in Cloud, Aruba, il
 * commercialista…) non scrive il codice commessa dentro la fattura: lo sa lui,
 * non il programma. Il risultato è che le fatture importate arrivano "orfane" e
 * la commessa non sa quanto ha incassato.
 *
 * Qui si prova a ricucire, ma senza inventare: ogni abbinamento porta con sé i
 * MOTIVI per cui è stato proposto, e solo i motivi che identificano una
 * commessa in modo univoco fanno scattare l'aggancio automatico. Tutto il resto
 * si propone a una persona, che conferma con un click.
 *
 * Il principio: meglio dieci fatture da confermare a mano che una attaccata
 * alla commessa sbagliata — un ricavo sul cantiere sbagliato falsa il margine
 * di due commesse in un colpo solo, e nessuno se ne accorge.
 */

/** Quanto ci si può fidare di un abbinamento. */
export type Confidenza = "certa" | "probabile" | "debole";

export interface FatturaDaAbbinare {
  id: string;
  /** Numero documento (può contenere il codice commessa). */
  numero?: string | null;
  /** Oggetto/descrizione e note: l'altro posto dove finisce il codice. */
  testo?: string | null;
  totale: number;
  data?: string | null;
  clientePiva?: string | null;
  clienteCodiceFiscale?: string | null;
  clienteEmail?: string | null;
  clienteRagioneSociale?: string | null;
  /** Profilo cliente già risolto, se il ponte anagrafico è popolato. */
  clienteProfileId?: string | null;
}

export interface RataCommessa {
  id: string;
  label: string;
  amount: number;
  is_paid: boolean;
  /** Se già coperta da un'altra fattura non si riusa. */
  invoice_id?: string | null;
}

export interface CommessaCandidata {
  id: string;
  order_code?: string | null;
  customerProfileId?: string | null;
  clientePiva?: string | null;
  clienteCodiceFiscale?: string | null;
  clienteEmail?: string | null;
  clienteRagioneSociale?: string | null;
  dataInizio?: string | null;
  dataFine?: string | null;
  rate?: RataCommessa[];
}

export interface Motivo {
  codice:
    | "codice_in_fattura"
    | "cliente_stesso_profilo"
    | "cliente_stessa_piva"
    | "cliente_stesso_cf"
    | "cliente_stessa_email"
    | "cliente_stessa_ragione_sociale"
    | "importo_uguale_a_rata"
    | "data_dentro_il_cantiere";
  testo: string;
  /** Peso nel punteggio complessivo. */
  punti: number;
}

export interface Abbinamento {
  commessaId: string;
  punteggio: number;
  confidenza: Confidenza;
  motivi: Motivo[];
  /** Rata il cui importo coincide con la fattura, se ce n'è una sola. */
  rataId?: string | null;
}

/** Via le formattazioni: "IT 012 345 678 90" e "IT01234567890" sono la stessa. */
export function normalizzaPiva(v?: string | null): string {
  if (!v) return "";
  return v.replace(/[^0-9A-Za-z]/g, "").toUpperCase().replace(/^IT/, "");
}

export function normalizzaEmail(v?: string | null): string {
  return (v ?? "").trim().toLowerCase();
}

/**
 * Ragione sociale confrontabile: via accenti, punteggiatura e le forme
 * societarie, che si scrivono in dieci modi diversi ("S.r.l.", "srl", "S R L")
 * e altrimenti farebbero fallire il confronto fra due nomi identici.
 */
export function normalizzaRagioneSociale(v?: string | null): string {
  if (!v) return "";
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(s\s?r\s?l|s\s?p\s?a|s\s?n\s?c|s\s?a\s?s|societa|impresa|ditta|individuale|unipersonale)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Confronto importi in centesimi: evita i falsi negativi da virgola mobile. */
export function stessoImporto(a: number, b: number, tolleranzaCent = 1): boolean {
  return Math.abs(Math.round(a * 100) - Math.round(b * 100)) <= tolleranzaCent;
}

/**
 * Il codice commessa compare nel testo della fattura?
 * Si cerca il codice PIÙ LUNGO fra quelli presenti: un codice corto come "C1"
 * comparirebbe dentro mille parole e attaccherebbe la fattura a caso.
 */
export function codiceCommessaNelTesto(testo: string, codici: string[]): string | null {
  const hay = testo.toUpperCase();
  const trovati = codici
    .map((c) => (c ?? "").trim().toUpperCase())
    .filter((c) => c.length >= 4 && hay.includes(c))
    .sort((a, b) => b.length - a.length);
  return trovati[0] ?? null;
}

/**
 * Identifica il cliente senza ambiguità (documento o anagrafica), a differenza
 * di email e ragione sociale, che sono somiglianze: un'email si condivide fra
 * più aziende e due ditte possono chiamarsi quasi uguale.
 */
const IDENTITA_FORTE: ReadonlyArray<Motivo["codice"]> = [
  "cliente_stesso_profilo",
  "cliente_stessa_piva",
  "cliente_stesso_cf",
];

/**
 * Valuta quanto una fattura somiglia a una commessa, e perché.
 * Restituisce null se non c'è nessun indizio: una commessa senza motivi non è
 * un candidato debole, è un non-candidato, e non va mostrata a nessuno.
 */
export function valutaAbbinamento(f: FatturaDaAbbinare, c: CommessaCandidata): Abbinamento | null {
  const motivi: Motivo[] = [];

  // ── Il codice commessa scritto in fattura: è una dichiarazione esplicita di
  //    chi ha emesso il documento, quindi vale da sola.
  const testo = `${f.numero ?? ""} ${f.testo ?? ""}`;
  if (c.order_code && codiceCommessaNelTesto(testo, [c.order_code])) {
    motivi.push({
      codice: "codice_in_fattura",
      testo: `Il codice commessa ${c.order_code} è scritto nella fattura`,
      punti: 100,
    });
  }

  // ── Identità del cliente. Il profilo risolto e la partita IVA identificano;
  //    email e ragione sociale sono indizi, non prove (email condivise fra più
  //    aziende, nomi simili fra ditte diverse).
  if (f.clienteProfileId && c.customerProfileId && f.clienteProfileId === c.customerProfileId) {
    motivi.push({ codice: "cliente_stesso_profilo", testo: "Stesso cliente in anagrafica", punti: 50 });
  } else {
    const pivaF = normalizzaPiva(f.clientePiva);
    const pivaC = normalizzaPiva(c.clientePiva);
    if (pivaF && pivaF === pivaC) {
      motivi.push({ codice: "cliente_stessa_piva", testo: `Stessa partita IVA (${f.clientePiva})`, punti: 50 });
    } else {
      const cfF = normalizzaPiva(f.clienteCodiceFiscale);
      const cfC = normalizzaPiva(c.clienteCodiceFiscale);
      if (cfF && cfF === cfC) {
        motivi.push({ codice: "cliente_stesso_cf", testo: "Stesso codice fiscale", punti: 50 });
      } else {
        const emF = normalizzaEmail(f.clienteEmail);
        if (emF && emF === normalizzaEmail(c.clienteEmail)) {
          motivi.push({ codice: "cliente_stessa_email", testo: `Stessa email (${f.clienteEmail})`, punti: 30 });
        }
        const rsF = normalizzaRagioneSociale(f.clienteRagioneSociale);
        if (rsF && rsF.length >= 4 && rsF === normalizzaRagioneSociale(c.clienteRagioneSociale)) {
          motivi.push({ codice: "cliente_stessa_ragione_sociale", testo: "Stessa ragione sociale", punti: 25 });
        }
      }
    }
  }

  // ── L'importo che combacia con una rata: da solo non basta (due commesse
  //    possono avere un acconto uguale), ma sopra l'identità del cliente è
  //    quello che rende l'abbinamento praticamente certo.
  let rataId: string | null = null;
  const rateLibere = (c.rate ?? []).filter((r) => !r.invoice_id);
  const rateUguali = rateLibere.filter((r) => stessoImporto(r.amount, f.totale));
  if (rateUguali.length === 1) {
    rataId = rateUguali[0].id;
    motivi.push({
      codice: "importo_uguale_a_rata",
      testo: `L'importo corrisponde alla rata «${rateUguali[0].label}»`,
      punti: 35,
    });
  }

  // ── La data dentro la finestra del cantiere: da sola non dice nulla, ma
  //    scarta i candidati palesemente fuori periodo.
  if (f.data && c.dataInizio && c.dataFine && f.data >= c.dataInizio && f.data <= c.dataFine) {
    motivi.push({ codice: "data_dentro_il_cantiere", testo: "Data fattura dentro il periodo dei lavori", punti: 10 });
  }

  if (motivi.length === 0) return null;

  const punteggio = motivi.reduce((t, m) => t + m.punti, 0);
  const ha = (c: Motivo["codice"]) => motivi.some((m) => m.codice === c);
  const identitaForte = IDENTITA_FORTE.some(ha);

  // La confidenza dice COSA sappiamo, non quanti punti abbiamo fatto: un
  // punteggio alto messo insieme da soli indizi deboli (email + nome simile +
  // importo) non è una certezza, e sommandoli lo diventerebbe.
  const confidenza: Confidenza =
    ha("codice_in_fattura") || (identitaForte && ha("importo_uguale_a_rata")) ? "certa"
    : identitaForte || ha("importo_uguale_a_rata") ? "probabile"
    : "debole";

  return { commessaId: c.id, punteggio, confidenza, motivi, rataId };
}

export interface EsitoRiconciliazione {
  migliore: Abbinamento | null;
  /** Tutti i candidati con almeno un indizio, dal più al meno probabile. */
  candidati: Abbinamento[];
  /**
   * true = si può agganciare da solo. Serve un punteggio da "certa" E che non
   * ci sia un secondo candidato altrettanto forte: fra due commesse a pari
   * merito la macchina non ha modo di scegliere, e sceglierebbe a caso.
   */
  agganciabileDaSolo: boolean;
}

export function riconcilia(f: FatturaDaAbbinare, commesse: CommessaCandidata[]): EsitoRiconciliazione {
  const candidati = commesse
    .map((c) => valutaAbbinamento(f, c))
    .filter((a): a is Abbinamento => a !== null)
    .sort((a, b) => b.punteggio - a.punteggio);

  const migliore = candidati[0] ?? null;
  const secondo = candidati[1];

  const agganciabileDaSolo =
    !!migliore &&
    migliore.confidenza === "certa" &&
    // Nessun ex aequo: se il secondo vale quanto il primo, decide una persona.
    (!secondo || secondo.punteggio < migliore.punteggio);

  return { migliore, candidati, agganciabileDaSolo };
}
