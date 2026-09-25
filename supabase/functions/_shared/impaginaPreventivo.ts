/**
 * L'impaginazione del preventivo generico (generate-quote-pdf), la parte che
 * non dipende da pdf-lib: le parole del titolo, il testo che va a capo misurato
 * e la sezione delle clausole da approvare con la seconda firma.
 *
 * Niente import esterni: lo usano la funzione e i test.
 */

// ─── Il titolo ──────────────────────────────────────────────────────────────

/** Una parola del titolo: fra asterischi è in corsivo; attaccata = senza spazio prima. */
export type ParolaTitolo = { testo: string; accento: boolean; attaccata: boolean };

/**
 * Le parole di un titolo con la parte fra asterischi in evidenza. La
 * punteggiatura che segue l'asterisco resta attaccata alla parola: prima
 * «Il tuo *progetto*, spiegato bene» usciva «progetto , spiegato».
 */
export function paroleDelTitolo(titolo: string): ParolaTitolo[] {
  const parole: ParolaTitolo[] = [];
  let inAccento = false;
  let spazioPrima = true;
  for (const pezzo of String(titolo ?? "").split(/(\*)/)) {
    if (pezzo === "*") {
      inAccento = !inAccento;
      continue;
    }
    for (const m of pezzo.matchAll(/\S+/g)) {
      parole.push({ testo: m[0], accento: inAccento, attaccata: parole.length > 0 && m.index === 0 && !spazioPrima });
    }
    if (pezzo) spazioPrima = /\s$/.test(pezzo);
  }
  return parole;
}

/**
 * Un titolo che non dice niente: «Preventivo», «Offerta n. 12», «Nuovo
 * preventivo OFF-2026-002». Al suo posto il PDF scrive per chi è.
 */
export function titoloGenerico(titolo: string, numero?: string | null): boolean {
  let resto = String(titolo ?? "").toLowerCase();
  if (numero) resto = resto.split(String(numero).toLowerCase()).join(" ");
  resto = resto
    .replace(/\b(nuovo|nuova|il|la|preventivo|offerta|proposta|commerciale|economica|n|nr|num|numero)\b\.?/g, " ")
    .replace(/\d+/g, " ")
    .replace(/[\s.,:;#°\-–—/]+/g, "");
  return resto.length === 0;
}

/**
 * Il nome come si legge in un titolo: «ROSSI MARIO» diventa «Rossi Mario».
 * Un nome scritto con le minuscole resta com'è: chi l'ha scritto così lo voleva.
 */
export function nomeLeggibile(nome: string): string {
  const n = String(nome ?? "").trim().replace(/\s+/g, " ");
  if (!n || n !== n.toUpperCase() || !/\p{Lu}/u.test(n)) return n;
  return n.toLowerCase().replace(/(^|[\s'’\-])(\p{L})/gu, (_m, prima: string, lettera: string) => prima + lettera.toUpperCase());
}

// ─── Il testo che va a capo misurato ────────────────────────────────────────

/** Un pezzo di testo con il suo stile (carattere, colore: lo decide chi disegna). */
export type Pezzo<S> = { testo: string; stile: S };
/** Un tratto di una riga già composta: il testo, lo stile e dove comincia. */
export type Tratto<S> = { testo: string; stile: S; x: number; larghezza: number };

/**
 * Compone il testo in righe della larghezza data, misurando le parole con il
 * carattere vero (prima si andava a capo contando i caratteri: le righe
 * finivano a tre quarti della pagina, o uscivano dal bordo). Una parola più
 * lunga della riga (un indirizzo web) si spezza. `primaRiga` è la larghezza
 * della prima riga, quando davanti c'è un'etichetta.
 */
export function componiRighe<S>(
  pezzi: Array<Pezzo<S>>,
  larghezza: number,
  misura: (testo: string, stile: S) => number,
  primaRiga: number = larghezza,
): Array<Array<Tratto<S>>> {
  type Parola = { testo: string; stile: S; spazio: boolean };
  const parole: Parola[] = [];
  let spazio = false;
  for (const p of pezzi) {
    for (const m of String(p.testo ?? "").matchAll(/\S+|\s+/g)) {
      if (/^\s+$/.test(m[0])) {
        spazio = true;
        continue;
      }
      parole.push({ testo: m[0], stile: p.stile, spazio: parole.length > 0 && spazio });
      spazio = false;
    }
  }

  const righe: Array<Array<Tratto<S>>> = [];
  let riga: Array<Tratto<S>> = [];
  let occupata = 0;
  const limite = () => (righe.length === 0 ? primaRiga : larghezza);
  const chiudi = () => {
    righe.push(riga);
    riga = [];
    occupata = 0;
  };
  const aggiungi = (testo: string, stile: S, conSpazio: boolean) => {
    const wSpazio = conSpazio && riga.length > 0 ? misura(" ", stile) : 0;
    const w = misura(testo, stile);
    const ultimo = riga[riga.length - 1];
    if (ultimo && ultimo.stile === stile) {
      // Stesso stile: un tratto solo, un drawText solo.
      ultimo.testo += (wSpazio ? " " : "") + testo;
      ultimo.larghezza += wSpazio + w;
    } else {
      riga.push({ testo, stile, x: occupata + wSpazio, larghezza: w });
    }
    occupata += wSpazio + w;
  };

  for (const pa of parole) {
    const w = misura(pa.testo, pa.stile);
    const wSpazio = pa.spazio && riga.length > 0 ? misura(" ", pa.stile) : 0;
    if (riga.length > 0 && occupata + wSpazio + w > limite()) chiudi();
    if (w <= limite()) {
      aggiungi(pa.testo, pa.stile, pa.spazio);
      continue;
    }
    // Più lunga di una riga intera: a pezzi, lettera per lettera.
    let resto = pa.testo;
    let primo = true;
    while (resto) {
      let n = resto.length;
      while (n > 1 && misura(resto.slice(0, n), pa.stile) > limite() - occupata) n--;
      aggiungi(resto.slice(0, n), pa.stile, primo && pa.spazio);
      primo = false;
      resto = resto.slice(n);
      if (resto) chiudi();
    }
  }
  if (riga.length > 0) chiudi();
  return righe;
}

/** Il grassetto del markdown (`**parola**`) diventa un pezzo in grassetto. */
export function pezziConGrassetto<S>(testo: string, normale: S, grassetto: S): Array<Pezzo<S>> {
  const pezzi: Array<Pezzo<S>> = [];
  String(testo ?? "").split(/(\*\*[^*]+\*\*)/).forEach((parte) => {
    if (!parte) return;
    const g = /^\*\*([^*]+)\*\*$/.exec(parte);
    pezzi.push(g ? { testo: g[1], stile: grassetto } : { testo: parte, stile: normale });
  });
  return pezzi;
}

// ─── Le clausole da approvare con la seconda firma (artt. 1341-1342 c.c.) ───

const eTitolo = (r: string) => /^#{1,4}\s/.test(r.trim());
const eTitoloClausole = (r: string) => eTitolo(r) && /1341|approvare specificamente/i.test(r);

/** La sezione delle clausole: le parole dell'azienda prima e dopo l'elenco, e l'elenco. */
export type SezioneClausole = { premessa: string[]; voci: string[]; chiusura: string[] };

/**
 * Le clausole che il cliente approva con una seconda firma: le voci elencate
 * sotto il titolo dell'art. 1341 c.c., con le frasi che l'azienda ha scritto
 * prima e dopo l'elenco. Prima il riquadro stampava solo l'elenco, con una
 * frase sua: le parole dell'azienda (per Ener gli artt. 33 e 34 del Codice del
 * Consumo e la dichiarazione di trattativa) sparivano. Senza quel titolo, o
 * senza voci, niente seconda firma.
 */
export function sezioneClausole(testo: string): SezioneClausole | null {
  const righe = String(testo ?? "").split("\n").map((r) => r.trim());
  const inizio = righe.findIndex(eTitoloClausole);
  if (inizio < 0) return null;
  const sezione: SezioneClausole = { premessa: [], voci: [], chiusura: [] };
  for (const r of righe.slice(inizio + 1)) {
    if (eTitolo(r)) break;
    if (!r) continue;
    if (/^[-*•]\s+/.test(r)) sezione.voci.push(r.replace(/^[-*•]\s+/, ""));
    else (sezione.voci.length === 0 ? sezione.premessa : sezione.chiusura).push(r);
  }
  return sezione.voci.length > 0 ? sezione : null;
}

/** Il testo senza la sezione delle clausole da approvare: quella sta nel riquadro. */
export function senzaSezioneClausole(testo: string): string {
  const righe = String(testo ?? "").split("\n");
  const inizio = righe.findIndex(eTitoloClausole);
  if (inizio < 0) return String(testo ?? "");
  let fine = righe.length;
  for (let i = inizio + 1; i < righe.length; i++) {
    if (eTitolo(righe[i])) {
      fine = i;
      break;
    }
  }
  return [...righe.slice(0, inizio), ...righe.slice(fine)].join("\n").trim();
}

// ─── I file riservati del modello (il timbro dell'impresa) ─────────────────

/**
 * Il percorso di un file del contenitore dei modelli, solo se sta nella cartella
 * dell'azienda («<azienda>/…»); se no null. La funzione legge col service role:
 * senza questo controllo un modello potrebbe indicare il timbro di un'altra
 * azienda e stamparlo nel proprio preventivo.
 */
export function percorsoDellAzienda(percorso: unknown, azienda: string | null | undefined): string | null {
  const p = String(percorso ?? "").trim().replace(/^\/+/, "");
  if (!p || !azienda) return null;
  if (!p.startsWith(`${azienda}/`) || p.includes("..") || p.includes("//")) return null;
  // «%2e%2e» e la barra rovesciata: la richiesta allo storage li trasforma in «..»
  // e «/», e il percorso uscirebbe dalla cartella (trovato dal revisore il 25/09).
  if (/[%\\]/.test(p)) return null;
  return p;
}
