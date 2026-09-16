import { haFraseUscita } from "./outreach-uscita.ts";
/**
 * Linter pre-invio per il cold outreach italiano.
 *
 * Perché in italiano e non tradotto: i filtri antispam lavorano sulla lingua
 * del messaggio, e le liste di "spam trigger words" inglesi non servono a
 * niente qui. "Preventivo gratuito" e "senza impegno" sono formule normali nel
 * commerciale italiano, ed è esattamente per quello che i filtri le hanno
 * imparate: sono fra i segnali più penalizzanti nel B2B italiano.
 *
 * La seconda lista è diversa e più sottile: le firme testuali dei testi
 * generati da LLM. In italiano sono ancora più riconoscibili che in inglese
 * perché quasi tutte sono traduzioni letterali che nessun italiano scriverebbe
 * spontaneamente ("Spero che questa email ti trovi bene").
 *
 * Sta in _shared/ perché serve a due padroni: l'editor lo usa per l'anteprima
 * live mentre scrivi, il dispatch come gate duro prima dell'invio. Stessa
 * regola in tutti e due i posti, un file solo.
 *
 * Rapporto con outreach-spam-score.ts, che vive qui accanto: quello dà un
 * PUNTEGGIO di rischio (quanto sei messo male), questo dà un VERDETTO (puoi
 * partire sì o no). Le parole spam di base si sovrappongono di proposito —
 * il gate deve reggere anche da solo — ma tutto il resto è diverso: firme da
 * testo generato, link per touch, HTML, emoji, caratteri invisibili, ritmo.
 *
 * Modulo puro: nessun import, nessuno stato.
 */

export type Gravita = "blocco" | "avviso";

export interface Rilievo {
  gravita: Gravita;
  regola: string;
  messaggio: string;
  /** Frammento incriminato, per evidenziarlo. */
  estratto?: string;
}

/** Blocco assoluto: se presenti, l'email non parte. */
const PAROLE_VIETATE = [
  "gratis", "gratuito", "gratuita", "omaggio", "sconto", "scontato",
  "promozione", "offerta speciale", "occasione unica", "imperdibile",
  "affrettati", "non perdere", "ultimi posti", "solo per oggi",
  "garantito al 100", "risultati garantiti", "soldi facili",
  "clicca qui", "clicca subito", "scopri di più",
  "guadagna", "raddoppia", "triplica", "risparmia fino a",
];

/** Ammesse una volta sola: normali in italiano, ma i filtri le pesano. */
const PAROLE_LIMITATE = [
  "preventivo", "senza impegno", "nessun costo", "prova gratuita",
  "opportunità", "vantaggio", "esclusivo", "rivoluzionario",
];

/** Firme testuali dei testi generati da LLM. */
const AI_TELL = [
  "spero che questa email ti trovi bene", "spero tu stia bene",
  "mi permetto di contattarti", "mi rivolgo a te in quanto",
  "ho notato con interesse", "mi ha colpito il fatto che",
  "nel panorama attuale", "in un mercato sempre più competitivo",
  "nell'era digitale", "come sicuramente saprai", "non è un segreto che",
  "soluzioni innovative", "all'avanguardia", "a 360 gradi",
  "best practice", "game changer",
  "non esitare a contattarmi", "resto a disposizione per qualsiasi chiarimento",
  "rimango in attesa di un tuo cortese riscontro", "ti ringrazio anticipatamente",
];

export interface OpzioniLint {
  /** Numero del touch: 1-3 vogliono zero link, dal 4 se ne ammette uno. */
  touch?: number;
  /**
   * Oltre questa lunghezza, in parole, l'email non parte (default 800). Fino al
   * 16/09/2026 il blocco scattava a 120: il titolare ha scelto di tenere i suoi
   * testi lunghi (Marketing Edile fino a 234 parole, Edilizia in Cloud fino a
   * 587). Sopra le 800 non è più un'email, è un documento incollato.
   */
  maxParole?: number;
  /** Oltre questa lunghezza solo un avviso (default 120): le email corte ricevono più risposte. */
  paroleConsigliate?: number;
}

const contaOccorrenze = (testo: string, ago: string): number => {
  // \y non esiste in JS: si delimita a mano con i confini non alfabetici.
  const re = new RegExp(`(^|[^a-zà-ù])${ago.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi");
  return (testo.match(re) ?? []).length;
};

export function lintEmail(subject: string, body: string, opz: OpzioniLint = {}): Rilievo[] {
  const touch = opz.touch ?? 1;
  const maxParole = opz.maxParole ?? 800;
  const paroleConsigliate = opz.paroleConsigliate ?? 120;
  const testo = `${subject}\n${body}`;
  const basso = testo.toLowerCase();
  const r: Rilievo[] = [];

  for (const p of PAROLE_VIETATE) {
    if (contaOccorrenze(basso, p) > 0)
      r.push({ gravita: "blocco", regola: "parola vietata", estratto: p,
        messaggio: `"${p}" è fra i termini che i filtri italiani penalizzano di più. Riscrivi la frase senza.` });
  }

  for (const p of PAROLE_LIMITATE) {
    const n = contaOccorrenze(basso, p);
    if (n > 1)
      r.push({ gravita: "blocco", regola: "parola limitata", estratto: p,
        messaggio: `"${p}" compare ${n} volte: ammessa una sola.` });
    else if (n === 1)
      r.push({ gravita: "avviso", regola: "parola limitata", estratto: p,
        messaggio: `"${p}" è una formula molto battuta nel commerciale italiano: pesala.` });
  }

  for (const p of AI_TELL) {
    if (basso.includes(p))
      r.push({ gravita: "blocco", regola: "suona generato", estratto: p,
        messaggio: `"${p}" è una frase da testo generato: nessun imprenditore la scriverebbe.` });
  }

  // Link: zero nei primi tre touch, massimo uno dal quarto.
  const link = (testo.match(/https?:\/\/\S+/gi) ?? []).length;
  const maxLink = touch >= 4 ? 1 : 0;
  if (link > maxLink)
    r.push({ gravita: "blocco", regola: "link",
      messaggio: `${link} link nel touch ${touch}: il massimo qui è ${maxLink}. Nei primi contatti un link raddoppia la probabilità di spam.` });

  if (/<[a-z][^>]*>/i.test(body))
    r.push({ gravita: "blocco", regola: "html",
      messaggio: "Il corpo contiene HTML. Una mail 1:1 vera è testo semplice: l'HTML la fa sembrare una newsletter." });

  if (/<img|\[image|cid:/i.test(body))
    r.push({ gravita: "blocco", regola: "immagini", messaggio: "Nessuna immagine nel cold, nemmeno il logo in firma." });

  const parole = body.trim().split(/\s+/).filter(Boolean).length;
  if (parole > maxParole)
    r.push({ gravita: "blocco", regola: "lunghezza",
      messaggio: `${parole} parole: sopra le ${maxParole} non è più un'email. Taglia.` });
  else if (parole > paroleConsigliate)
    r.push({ gravita: "avviso", regola: "lunghezza",
      messaggio: `${parole} parole: sopra le ${paroleConsigliate} le risposte calano. Parte lo stesso.` });
  else if (parole > 0 && parole < 30)
    r.push({ gravita: "avviso", regola: "lunghezza", messaggio: `${parole} parole: probabilmente troppo poche per dire qualcosa di specifico.` });

  // Forma del subject: 2-4 parole, minuscolo, niente punteggiatura enfatica.
  const parolesubj = subject.trim().split(/\s+/).filter(Boolean).length;
  if (parolesubj > 5)
    r.push({ gravita: "avviso", regola: "oggetto", messaggio: `Oggetto di ${parolesubj} parole: 2-4 rendono di più e sembrano scritte a mano.` });
  if (/[!]{1,}|\?{2,}/.test(subject))
    r.push({ gravita: "blocco", regola: "oggetto", messaggio: "Punteggiatura enfatica nell'oggetto: togli i punti esclamativi." });
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(subject))
    r.push({ gravita: "blocco", regola: "oggetto", messaggio: "Emoji nell'oggetto: segnale bulk immediato." });

  if (/\b[A-ZÀ-Ù]{4,}\b/.test(testo.replace(/\{\{[^}]*\}\}/g, "")))
    r.push({ gravita: "avviso", regola: "maiuscolo", messaggio: "Parole tutte in maiuscolo: leggono come pubblicità." });

  if (/[​-‍﻿]/.test(testo))
    r.push({ gravita: "blocco", regola: "caratteri invisibili",
      messaggio: "Caratteri a larghezza zero nel testo: i filtri li leggono come tentativo di offuscamento." });

  // Segnaposto non risolti: peggio di una mail generica è una che lo dichiara.
  const nonRisolti = testo.match(/\{\{\s*[^}]+\s*\}\}/g) ?? [];
  if (nonRisolti.length)
    r.push({ gravita: "avviso", regola: "segnaposto", estratto: nonRisolti[0],
      messaggio: `Segnaposto ancora da riempire (${nonRisolti.length}): verifica che abbiano un valore per ogni contatto.` });

  // Via d'uscita: senza List-Unsubscribe (stile umano) l'unico modo di dire
  // «basta» è una frase nel corpo. Se manca, il dispatcher la aggiunge da sé:
  // qui è un avviso perché chi scrive sappia come si chiuderà il messaggio.
  if (!haFraseUscita(body))
    r.push({ gravita: "avviso", regola: "uscita",
      messaggio: "Manca la via d'uscita («rispondi no e non ti scrivo più»): il motore la aggiunge in fondo, prima della firma." });

  // Tre frasi di lunghezza uguale = ritmo innaturale, tipico dei testi generati.
  const frasi = body.split(/[.!?]+/).map((f) => f.trim().split(/\s+/).filter(Boolean).length).filter((n) => n > 2);
  if (frasi.length >= 3) {
    const media = frasi.reduce((a, b) => a + b, 0) / frasi.length;
    const dev = Math.sqrt(frasi.reduce((a, b) => a + (b - media) ** 2, 0) / frasi.length);
    if (dev < 2)
      r.push({ gravita: "avviso", regola: "ritmo",
        messaggio: "Le frasi hanno tutte la stessa lunghezza: alternane una lunga, una corta, una media." });
  }

  return r;
}

/** true se l'email può partire (nessun blocco). */
export const puoPartire = (rilievi: Rilievo[]): boolean => !rilievi.some((x) => x.gravita === "blocco");
