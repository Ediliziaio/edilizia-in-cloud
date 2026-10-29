import { arrotonda, type ComputoMisura, type ComputoStrutturato, type ComputoVoceStrutturata } from "./computoStrutturato";
import { arrotondaDecimale, calcolaVoce, misuraVuota, voceVuota, type BozzaComputo, type MisuraEditor, type VoceEditor } from "./editorNativo";

/**
 * Un computo letto da PriMus (PDF o XPWE) diventa una bozza dell'editor.
 *
 * Il caso vero è quasi sempre questo: il computo lo scrive il progettista in
 * PriMus e lo manda all'impresa, che deve prezzarlo. Ribatterlo a mano vuol
 * dire ore e errori; il lettore lo sa già leggere riga per riga.
 *
 * Tre scelte, nessuna di comodo:
 *
 * - **Le righe di misura restano righe di misura.** Il modale di caricamento
 *   generico salva solo la quantità totale di ogni voce: un computo senza
 *   misure non si giustifica e non si stampa come PriMus. Qui ogni riga
 *   conserva par.ug., lung., larg. e H/peso.
 * - **Le formule di PriMus restano scritte.** PriMus le tiene campo per campo
 *   («par.ug.=2*13»); l'editor ha una formula per riga intera. Il lettore ha
 *   già valutato i campi, quindi i numeri vanno nelle loro colonne e la
 *   formula originale resta accanto alla descrizione, come la stampa PriMus.
 * - **I livelli seguono il computo.** Il capitolo dell'editor è il livello più
 *   alto che il computo usa: le super-categorie se ci sono, altrimenti le
 *   categorie. Altrimenti, con un computo a sole categorie, finirebbe tutto in
 *   un capitolo unico.
 *
 * PriMus arrotonda la quantità di ogni riga di misura prima di sommarla;
 * l'editor no. Le voci dove la differenza cambia la quantità sono riportate
 * in `scostamenti`, con il valore del documento: si vedono, non si nascondono.
 */

/** Quanto spazio dà l'editor (vedi `bozzaComputoSchema`). */
const MAX_VOCI = 5000;
const MAX_MISURE = 500;
const MAX_TESTO = 30000;

export interface ScostamentoImport {
  /** Posizione della voce nel computo importato, da 1. */
  voce: number;
  tariffa: string;
  quantitaDocumento: number;
  quantitaRicalcolata: number;
}

export interface EsitoImportComputo {
  voci: VoceEditor[];
  /** Campi d'intestazione letti dal documento, da usare solo dove la bozza è vuota. */
  intestazione: Partial<Pick<BozzaComputo, "titolo" | "committente" | "oggetto" | "dataDocumento">>;
  totaleDocumento: number | null;
  totaleRicalcolato: number;
  scostamenti: ScostamentoImport[];
  /**
   * Voci con la descrizione accorciata dal documento. PriMus, stampando in
   * PDF, abbrevia le descrizioni lunghe con «...» in mezzo: il testo intero nel
   * PDF non c'è, c'è nell'XPWE. Un numero solo, non un avviso per voce: a
   * Genzano erano 82 su 226, e ottanta righe uguali non dicono cosa fare.
   */
  descrizioniTroncate: number;
  avvisi: string[];
}

/** Numero come lo scrive l'editor: virgola, niente separatori delle migliaia. */
function cifra(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return n.toLocaleString("it-IT", { useGrouping: false, maximumFractionDigits: 6 });
}

/**
 * Un titolo dall'oggetto dei lavori, che è spesso lungo una frase intera.
 * Si taglia alla fine di una frase o di una parola, mai in mezzo: dalla
 * copertina del computo di Genzano il taglio secco a 160 caratteri dava
 * «…Corso Umberto I n.81. Preazzi» invece di «Preazziari».
 */
export function titoloDaOggetto(oggetto: string, max = 160): string {
  const s = oggetto.trim().replace(/\s+/g, " ");
  if (s.length <= max) return s;
  const pezzo = s.slice(0, max);
  const fineFrase = pezzo.lastIndexOf(". ");
  if (fineFrase >= max * 0.5) return pezzo.slice(0, fineFrase + 1);
  const spazio = pezzo.slice(0, max - 1).lastIndexOf(" ");
  return `${pezzo.slice(0, spazio > 0 ? spazio : max - 1).replace(/[\s,;:.-]+$/, "")}…`;
}

/** La data del computo come la legge un italiano: 2025-07-16 diventa 16/07/2025; il resto resta com'è. */
export function dataItaliana(s: string): string {
  const iso = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : s.trim();
}

type Livello = "super_categoria" | "categoria" | "sotto_categoria";

/** I tre livelli dell'editor (capitolo, categoria, sottocategoria) presi dal computo. */
function livelliDelComputo(voci: ComputoVoceStrutturata[]): [Livello | null, Livello | null, Livello | null] {
  if (voci.some(v => v.super_categoria?.nome)) return ["super_categoria", "categoria", "sotto_categoria"];
  if (voci.some(v => v.categoria?.nome)) return ["categoria", "sotto_categoria", null];
  return [null, null, null];
}

function misuraDaDocumento(m: ComputoMisura): MisuraEditor {
  const dimensioni = [m.parti_uguali, m.lunghezza, m.larghezza, m.altezza_peso];
  const conFormula = m.formula ? `${m.descrizione} (${m.formula})`.trim() : m.descrizione;
  const base = { ...misuraVuota(), descrizione: conFormula.slice(0, MAX_TESTO) };
  // Riga con la sola quantità: nell'editor è una formula fatta del solo numero.
  if (dimensioni.every(n => n === null)) return { ...base, formula: cifra(m.quantita) };
  return {
    ...base,
    parti: cifra(m.parti_uguali), lunghezza: cifra(m.lunghezza),
    larghezza: cifra(m.larghezza), altezza: cifra(m.altezza_peso),
  };
}

export function bozzaDaComputoStrutturato(c: ComputoStrutturato): EsitoImportComputo {
  if (!c.voci.length) throw new Error("Il documento non contiene lavorazioni da importare.");
  if (c.voci.length > MAX_VOCI) {
    throw new Error(`Il computo ha ${c.voci.length} lavorazioni: l'editor ne gestisce al massimo ${MAX_VOCI}.`);
  }
  const troppe = c.voci.findIndex(v => v.misure.length > MAX_MISURE);
  if (troppe >= 0) {
    throw new Error(`La lavorazione ${c.voci[troppe].numero_ordine || troppe + 1} ha ${c.voci[troppe].misure.length} righe di misura: l'editor ne gestisce al massimo ${MAX_MISURE}.`);
  }

  const [l1, l2, l3] = livelliDelComputo(c.voci);
  const avvisi = [...c.avvisi];
  const scostamenti: ScostamentoImport[] = [];
  const nome = (v: ComputoVoceStrutturata, l: Livello | null) => (l ? v[l]?.nome?.trim() : "") || "";

  const voci = c.voci.map((v, i): VoceEditor => {
    const capitolo = nome(v, l1) || v.sezione?.trim() || "Opere edili";
    // PriMus usa un prezzo negativo per spostare importi fra categorie (es. «−1 €»
    // per l'incidenza della sicurezza). L'editor non ammette prezzi negativi:
    // lo stesso importo si ottiene col prezzo positivo e la voce in detrazione.
    const negativo = v.prezzo_unitario !== null && v.prezzo_unitario < 0;
    const voce: VoceEditor = {
      ...voceVuota(),
      capitolo: capitolo.slice(0, 300),
      categoria: nome(v, l2).slice(0, 300),
      sottocategoria: nome(v, l3).slice(0, 300),
      tariffa: (v.codice_tariffa || v.codici[0] || "").slice(0, 160),
      descrizione: v.descrizione.slice(0, MAX_TESTO),
      unita: (v.unita_misura || "").slice(0, 40),
      prezzo: cifra(v.prezzo_unitario === null ? null : Math.abs(v.prezzo_unitario)),
      quantita: v.misure.length ? "" : cifra(v.quantita),
      sicurezza: v.is_sicurezza, detrazione: v.is_detrazione !== negativo, corpo: v.a_corpo,
      misure: v.misure.map(misuraDaDocumento),
    };
    const ricalcolo = calcolaVoce(voce).quantita;
    if (v.quantita !== null && ricalcolo !== null && Math.abs(Math.abs(ricalcolo) - Math.abs(v.quantita)) >= 0.005) {
      scostamenti.push({ voce: i + 1, tariffa: voce.tariffa, quantitaDocumento: v.quantita, quantitaRicalcolata: ricalcolo });
    }
    return voce;
  });

  const totaleRicalcolato = arrotonda(voci.reduce((s, v) => s + (calcolaVoce(v).importo ?? 0), 0));
  const m = c.metadata ?? {};
  const intestazione: EsitoImportComputo["intestazione"] = {};
  if (m.oggetto_lavori?.trim()) {
    intestazione.oggetto = m.oggetto_lavori.trim().slice(0, 500);
    intestazione.titolo = titoloDaOggetto(m.oggetto_lavori);
  }
  if (m.committente?.trim()) intestazione.committente = m.committente.trim().slice(0, 160);
  if (m.data_computo?.trim()) intestazione.dataDocumento = dataItaliana(m.data_computo).slice(0, 40);

  const descrizioniTroncate = c.voci.filter(v => v.descrizione_troncata).length;
  return { voci, intestazione, totaleDocumento: c.totale_dichiarato, totaleRicalcolato, scostamenti, descrizioniTroncate, avvisi };
}

/**
 * Le voci estratte dall'AI (PDF qualsiasi, Excel, foto, dettatura): gli stessi
 * componenti di Ristrutturazione e degli altri moduli, con la stessa revisione.
 *
 * Il prezzo è quello che la revisione chiama «prezzo impresa» (col ricarico
 * scelto lì, 15% di serie), cioè quello che l'utente ha visto e confermato;
 * il prezzo del computo resta il ripiego. Ristrutturazione prende sempre il
 * prezzo del computo, e chi imposta un ricarico se lo vede sparire.
 *
 * L'AI non restituisce righe di misura: la quantità arriva come totale.
 */
export function vociDaEstrazioneAi(estratte: ReadonlyArray<{
  capitolo_nome: string | null; descrizione_breve: string; descrizione_estesa: string | null;
  unita_misura: string | null; quantita: number; prezzo_unitario_computo: number; _prezzoImpresa?: number;
  codice_voce: string | null; codice_prezzario: string | null;
}>): VoceEditor[] {
  return estratte.map(v => {
    const descrizione = [v.descrizione_breve, v.descrizione_estesa].map(s => s?.trim() ?? "")
      .filter((s, n, tutte) => !!s && tutte.indexOf(s) === n).join("\n");
    const unita = (v.unita_misura ?? "").trim().slice(0, 40);
    const prezzo = Number.isFinite(v._prezzoImpresa) && (v._prezzoImpresa ?? 0) > 0 ? v._prezzoImpresa! : v.prezzo_unitario_computo;
    return {
      ...voceVuota(),
      capitolo: (v.capitolo_nome?.trim() || "Opere edili").slice(0, 300),
      descrizione: descrizione.slice(0, MAX_TESTO),
      tariffa: (v.codice_voce?.trim() || v.codice_prezzario?.trim() || "").slice(0, 160),
      // Il ricarico lascia decimali infiniti (24 × 1,15 = 27,5999…): il prezzo si scrive al centesimo.
      unita, quantita: cifra(v.quantita), prezzo: cifra(Number.isFinite(prezzo) ? arrotondaDecimale(prezzo) : null),
      corpo: unita === "corpo" || unita === "a corpo",
    };
  });
}

/**
 * Le voci importate si aggiungono in coda: un import non cancella mai il
 * lavoro già fatto. L'intestazione riempie solo i campi ancora vuoti o
 * rimasti al titolo predefinito.
 */
export function applicaImportComputo(bozza: BozzaComputo, esito: EsitoImportComputo): BozzaComputo {
  if (bozza.voci.length + esito.voci.length > MAX_VOCI) {
    throw new Error(`Con l'import le lavorazioni sarebbero ${bozza.voci.length + esito.voci.length}: l'editor ne gestisce al massimo ${MAX_VOCI}.`);
  }
  const vuoto = (s: string, predefinito?: string) => !s.trim() || s.trim() === predefinito;
  const i = esito.intestazione;
  return {
    ...bozza,
    titolo: i.titolo && vuoto(bozza.titolo, "Nuovo computo metrico") ? i.titolo : bozza.titolo,
    committente: i.committente && vuoto(bozza.committente) ? i.committente : bozza.committente,
    oggetto: i.oggetto && vuoto(bozza.oggetto) ? i.oggetto : bozza.oggetto,
    dataDocumento: i.dataDocumento && vuoto(bozza.dataDocumento) ? i.dataDocumento : bozza.dataDocumento,
    voci: [...bozza.voci, ...esito.voci],
  };
}
