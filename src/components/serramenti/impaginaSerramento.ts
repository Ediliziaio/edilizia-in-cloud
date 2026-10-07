/**
 * Quanto spazio resta in fondo all'ultimo foglio di una sezione del preventivo
 * Serramenti, stimato prima di disegnarla.
 *
 * Non serve a dare l'altezza alla foto che riempie il fondo (FotoInFondo in
 * SerramentoPDF la prende da sola, a pagine già fatte): serve a decidere se la
 * foto vale la pena. Sotto i 130 punti sarebbe una striscia, e non esce.
 *
 * La sezione è un elenco di pezzi, nell'ordine in cui escono: ognuno alto quanto
 * i suoi caratteri (misuraTesto, metriche vere di Helvetica) più margini e
 * cornici presi dagli stili di SerramentoPDF. Un pezzo che non sta va sul foglio
 * dopo, come fa react-pdf con gli elementi `wrap={false}`; un testo lungo si
 * spezza fra le righe. Le misure sono tarate sul preventivo di prova di Demo
 * Azienda 2 (SF-260922-0003): sbagliano di una decina di punti, non di più.
 */
import { altezzaTesto, larghezzaTesto, righeDiTesto, testoDaHtml } from "@/components/preventivi/pdf/misuraTesto";

/** Larghezza utile della pagina: l'A4 meno i margini laterali (44 + 44). */
export const UTILE_PAGINA = 595.28 - 44 * 2;

/**
 * Altezza utile della pagina: dal fondo dell'intestazione (40 di margine, 34 di
 * logo, 12 + 1 + 24 sotto) al margine basso che lascia posto al piè (92).
 */
export const ALTEZZA_UTILE = 841.89 - (40 + 34 + 12 + 1 + 24) - 92;

/** Sotto quest'altezza la foto in fondo sarebbe una striscia: non esce. */
export const FOTO_IN_FONDO_MINIMA = 130;

/** Il margine sopra la foto in fondo (FotoInFondo). */
export const STACCO_FOTO_IN_FONDO = 18;

/**
 * Interlinea di react-pdf quando lo stile non la dice: misurata sul PDF, 1,1 volte
 * il corpo (11 punti fra due righe a 10 punti), in tondo e in grassetto.
 */
const INTERLINEA_NATURALE = 1.1;
const INTERLINEA_NATURALE_GRASSETTO = 1.1;

export interface Pezzo {
  /** Altezza in punti, margini compresi. */
  alto: number;
  /** Testo che si può spezzare fra una riga e l'altra: l'altezza di una riga. */
  riga?: number;
  /**
   * Titolo: se dopo di lui non ci stanno almeno questi punti del pezzo dopo, va a capo con lui (minPresenceAhead).
   * `Infinity` quando titolo e pezzo dopo stanno in un contenitore che non si spezza (`wrap={false}`): vanno insieme.
   */
  conSeguente?: number;
  /** Intestazione che si ripete in cima a ogni foglio mentre il pezzo continua (la testata `fixed` di una tabella). */
  testataRipetuta?: number;
}

/** Fogli e altezza occupata sull'ultimo, con fogli alti `utile`. */
export function impagina(pezzi: Pezzo[], utile = ALTEZZA_UTILE): { fogli: number; coda: number } {
  let fogli = 1;
  let y = 0;
  pezzi.forEach((p, i) => {
    const seguente = pezzi[i + 1];
    const nuovoFoglio = (alto: number) => {
      fogli += 1;
      y = (p.testataRipetuta ?? 0) + alto;
    };
    if (y + p.alto <= utile) {
      if (p.conSeguente && seguente && y > 0 && y + p.alto + Math.min(p.conSeguente, seguente.alto) > utile) {
        nuovoFoglio(p.alto);
        return;
      }
      y += p.alto;
      return;
    }
    if (p.riga && y > 0) {
      // Un testo va a capo fra le righe: almeno due restano, almeno due passano.
      const righe = Math.round(p.alto / p.riga);
      const stanno = Math.floor((utile - y) / p.riga);
      if (stanno >= 2 && righe - stanno >= 2) {
        nuovoFoglio((righe - stanno) * p.riga);
        return;
      }
    }
    if (y > 0) nuovoFoglio(p.alto);
    else y = p.alto;
  });
  return { fogli, coda: y };
}

/**
 * Lo spazio che resta sotto l'ultimo pezzo, sapendo quanti fogli ha davvero la
 * sezione. Se la stima dice un numero di fogli diverso, si rifà con fogli un
 * po' più bassi o più alti finché torna: vicino al bordo di un foglio la stima
 * può sbagliare di qualche punto, e il numero vero dice da che parte. Se non
 * torna mai, 0: meglio niente foto che una foto a caso.
 */
export function spazioInFondo(pezzi: Pezzo[], fogliVeri: number): number {
  for (const scarto of [0, -12, 12, -24, 24, -36, 36]) {
    const { fogli, coda } = impagina(pezzi, ALTEZZA_UTILE + scarto);
    if (fogli === fogliVeri) return Math.max(0, ALTEZZA_UTILE - coda - STACCO_FOTO_IN_FONDO);
  }
  return 0;
}

// ─── Le misure dei pezzi ricorrenti ───────────────────────────────────────

/** Occhiello + titolo grande + sottotitolo in cima a una sezione (pageEyebrow, pageTitle, pageSubtitle). */
export function altezzaTesta(titolo: string, sottotitolo: string | null, corpoTitolo = 34, spazioSotto = 22): number {
  const occhiello = 9 * INTERLINEA_NATURALE + 6;
  const tit = altezzaTesto(titolo, UTILE_PAGINA, "Helvetica-Bold", corpoTitolo, 1.05) + 8;
  const sotto = sottotitolo ? altezzaTesto(sottotitolo, UTILE_PAGINA, "Helvetica", 11, 1.45) + spazioSotto : 0;
  return occhiello + tit + sotto;
}

/** Il titolo di un gruppo (sectionTitle: maiuscolo 10 pt, filetto sotto). */
export const TITOLO_GRUPPO = 20 + 10 * INTERLINEA_NATURALE_GRASSETTO + 5 + 1 + 8;

/** Una voce con pallino, titolo in grassetto e spiegazione (bulletItem). */
export function altezzaVoce(titolo: string, descrizione: string | null | undefined, larghezza = UTILE_PAGINA, corpoTitolo = 11, corpoTesto = 10, spazioSotto = 10): number {
  const w = larghezza - 14;
  const t = altezzaTesto(titolo, w, "Helvetica-Bold", corpoTitolo, INTERLINEA_NATURALE_GRASSETTO) + 2;
  const d = descrizione ? altezzaTesto(descrizione, w, "Helvetica", corpoTesto, 1.55) : 0;
  return t + d + spazioSotto;
}

// ─── Proposta di intervento ───────────────────────────────────────────────

export interface DatiProposta {
  titolo: string;
  sottotitolo: string;
  righeAnagrafica: string[];
  sintesi: string;
  esigenze: Array<{ titolo: string; descrizione?: string | null }>;
  soluzione: Array<{ titolo: string; descrizione?: string | null }>;
  percheTitolo: string | null;
  metriche: Array<{ label: string }>;
  perche: Array<{ titolo: string; descrizione?: string | null }>;
  consulente: { descrizione: string | null; contatti: string; appuntamento: boolean };
}

export function pezziProposta(d: DatiProposta): Pezzo[] {
  const pezzi: Pezzo[] = [{ alto: altezzaTesta(d.titolo, d.sottotitolo) }];
  pezzi.push({ alto: TITOLO_GRUPPO, conSeguente: 40 });
  for (const valore of d.righeAnagrafica) pezzi.push({ alto: Math.max(9, altezzaTesto(valore, UTILE_PAGINA - 95, "Helvetica-Bold", 10, INTERLINEA_NATURALE_GRASSETTO)) + 4 });
  // Il testo della sintesi si spezza fra le righe: col titolo ne restano almeno due.
  pezzi.push({ alto: TITOLO_GRUPPO, conSeguente: 56 });
  const riga = 10.5 * 1.6;
  pezzi.push({ alto: altezzaTesto(d.sintesi, UTILE_PAGINA - 31, "Helvetica", 10.5, 1.6) + 24, riga });
  for (const [voci, quante] of [[d.esigenze, 3], [d.soluzione, 4]] as const) {
    if (voci.length === 0) continue;
    // Il titolo sta con la prima voce (stesso contenitore che non si spezza).
    pezzi.push({ alto: TITOLO_GRUPPO, conSeguente: Infinity });
    for (const v of voci.slice(0, quante)) pezzi.push({ alto: altezzaVoce(v.titolo, v.descrizione) });
  }
  if (d.percheTitolo) {
    pezzi.push({ alto: altezzaTesto(d.percheTitolo, UTILE_PAGINA, "Helvetica-Bold", 10, INTERLINEA_NATURALE_GRASSETTO) + 34, conSeguente: Infinity });
    if (d.metriche.length > 0) {
      const larga = (UTILE_PAGINA - 8 * (d.metriche.length - 1)) / d.metriche.length - 16;
      const etichetta = Math.max(...d.metriche.map((m) => altezzaTesto(m.label.toUpperCase(), larga, "Helvetica-Bold", 8, INTERLINEA_NATURALE_GRASSETTO)));
      pezzi.push({ alto: 4 + 24 + 20 * INTERLINEA_NATURALE_GRASSETTO + 3 + etichetta + 14 });
    }
    for (const v of d.perche.slice(0, 5)) pezzi.push({ alto: altezzaVoce(v.titolo, v.descrizione) });
  }
  // La tua consulenza: titolo e riquadro insieme.
  const larga = UTILE_PAGINA - 32 - 64 - 14;
  const testo = 13 * INTERLINEA_NATURALE_GRASSETTO + 2 + 9.5 * INTERLINEA_NATURALE
    + (d.consulente.descrizione ? 5 + testoDaHtml(d.consulente.descrizione).split("\n").filter(Boolean)
      .reduce((acc, p) => acc + altezzaTesto(p, larga, "Helvetica", 9.5, 1.5) + 6, 0) : 0)
    + 6 + (d.consulente.appuntamento ? 12.6 : 0) + (d.consulente.contatti ? altezzaTesto(d.consulente.contatti, larga, "Helvetica", 9, 1.4) : 0);
  pezzi.push({ alto: TITOLO_GRUPPO + 8 + 32 + Math.max(64, testo) });
  return pezzi;
}

// ─── Allegato tecnico ─────────────────────────────────────────────────────

/** La testata della tabella dei serramenti, ripetuta in cima a ogni foglio mentre la tabella continua. */
const TESTATA_TABELLA = 6 + 7.5 * INTERLINEA_NATURALE_GRASSETTO + 1 + 5;

/** Quello che una riga dell'allegato stampa, per misurarla. */
export interface RigaAllegato {
  /** Larghezza della colonna della foto/disegno (di serie 70). */
  colonnaFoto?: number;
  /** Altezza che il disegno occupa nella riga, se c'è. */
  altezzaFoto?: number;
  macro: string | null;
  titolo: string;
  datiPrincipali: string;
  fornitore: string | null;
  colori: string | null;
  tecnica: string | null;
  descrizioneTecnica: string | null;
  soloFornitura: boolean;
  schede: string[];
  scelte: string[];
  note: string | null;
}

/** Quante righe di chip (etichetta: valore) in una colonna larga `larghezza`. */
function righeDiChip(chip: string[], larghezza: number): number {
  let righe = chip.length > 0 ? 1 : 0;
  let x = 0;
  for (const c of chip) {
    const w = larghezzaTesto(c, "Helvetica-Bold", 8.5) + 12 + 4;
    if (x > 0 && x + w > larghezza) { righe += 1; x = w; } else x += w;
  }
  return righe;
}

/** Altezza di una riga dei serramenti (tableRow): la colonna del testo o la miniatura, più 9 + 9 di margine. */
export function altezzaRigaAllegato(r: RigaAllegato): number {
  const w = UTILE_PAGINA - 28 - (r.colonnaFoto ?? 70) - 50 - 6;
  const muta = (t: string) => altezzaTesto(t, w, "Helvetica", 9, 1.4) + 2;
  let testo = 0;
  if (r.macro) testo += 7.5 * INTERLINEA_NATURALE_GRASSETTO + 1;
  testo += altezzaTesto(r.titolo, w, "Helvetica-Bold", 10, INTERLINEA_NATURALE_GRASSETTO);
  if (r.datiPrincipali) testo += muta(r.datiPrincipali);
  if (r.fornitore) testo += 8.2 * INTERLINEA_NATURALE_GRASSETTO + 2;
  if (r.colori) testo += muta(r.colori);
  if (r.tecnica) testo += muta(r.tecnica);
  if (r.descrizioneTecnica) testo += altezzaTesto(r.descrizioneTecnica, w, "Helvetica", 8.5, 1.45) + 3;
  if (r.soloFornitura) testo += altezzaTesto("Nota: vendita in sola fornitura. Manodopera e posa non sono incluse per questo articolo.", w, "Helvetica", 8.5, INTERLINEA_NATURALE) + 3;
  if (r.schede.length > 0) testo += 4 + righeDiChip(r.schede, w) * (8.5 * INTERLINEA_NATURALE + 4 + 3);
  if (r.scelte.length > 0) testo += 2 + righeDiChip(r.scelte, w) * (8.5 * INTERLINEA_NATURALE + 4 + 3);
  if (r.note) testo += muta(r.note);
  return 18.5 + Math.max(60, r.altezzaFoto ?? 0, 6 + 13 * INTERLINEA_NATURALE_GRASSETTO, testo);
}

/** I complementi nell'Allegato: miniatura a sinistra (foto del listino o disegno della persiana), poi voce, scelte e a quale finestra sono legati. */
export const COLONNA_IMMAGINE_ACCESSORIO = 54;
export const ALTEZZA_IMMAGINE_ACCESSORIO = 44;

export function pezziAllegato(righe: RigaAllegato[], accessori: Array<{ descrizione: string; scelte: string | null; immagine?: boolean; per?: string | null }>): Pezzo[] {
  const pezzi: Pezzo[] = [
    { alto: altezzaTesta("Cosa installeremo\nin cantiere.", "Composizione dettagliata di serramenti, accessori e scelte tecniche previste.") },
    // Titolo e testata della tabella, con la prima riga (SerramentoPDF: minPresenceAhead 150).
    { alto: TITOLO_GRUPPO + 8 + TESTATA_TABELLA, conSeguente: 120 },
    ...righe.map((r) => ({ alto: altezzaRigaAllegato(r), testataRipetuta: TESTATA_TABELLA })),
  ];
  if (accessori.length > 0) {
    // Titolo, testata e prima voce (SerramentoPDF: minPresenceAhead 90).
    pezzi.push({ alto: TITOLO_GRUPPO + 8 + TESTATA_TABELLA, conSeguente: 60 });
    for (const a of accessori) {
      const w = UTILE_PAGINA - 110 - 50 - 6 - (a.immagine ? COLONNA_IMMAGINE_ACCESSORIO : 0);
      const testo = 18.5 + altezzaTesto(a.descrizione, w, "Helvetica-Bold", 10, INTERLINEA_NATURALE_GRASSETTO)
        + (a.scelte ? altezzaTesto(a.scelte, w, "Helvetica", 9, 1.4) + 2 : 0)
        + (a.per ? altezzaTesto(a.per, w, "Helvetica", 8, 1.4) + 2 : 0);
      pezzi.push({ alto: a.immagine ? Math.max(testo, 18.5 + ALTEZZA_IMMAGINE_ACCESSORIO) : testo });
    }
  }
  return pezzi;
}

// ─── Proposta economica ───────────────────────────────────────────────────

export interface DatiInvestimento {
  /** Il testo sotto il titolo «Importo chiaro»: cambia col prezzo scritto a mano. */
  sottotitolo: string;
  /** La riga «Prezzo … · Sconto …» nel riquadro del prezzo. */
  sconto: boolean;
  /** Righe della nota sull'IVA: una, due con l'IVA mista. */
  righeNotaIva: number;
  /** La riga «oppure a rate / netto dopo il recupero fiscale» dentro il riquadro. */
  rataENetto: boolean;
  /** L'avviso con la scadenza dell'offerta: la sua descrizione, e se c'è lo sconto per chi firma presto. */
  urgenza: { descrizione: string | null; scontoFirmaPresto: boolean } | null;
  /** Le tappe del pagamento: fino a quattro in fila, oltre un elenco. Zero: niente riquadro. */
  tappe: number;
  finanziamento: boolean;
}

/**
 * La pagina della proposta economica, dal titolo al finanziamento. Tarata sul PDF vero (07/10/2026): testata 119,
 * riquadro del prezzo 117 (più 12 con lo sconto e 52 con la riga delle rate), avviso della scadenza 73, tappe in fila 166
 * o in elenco 67 + 46 a tappa, finanziamento 128.
 */
export function pezziInvestimento(d: DatiInvestimento): Pezzo[] {
  // Occhiello, titolo a 28 punti su due righe (6 sotto) e sottotitolo a 10 punti (12 sotto).
  const pezzi: Pezzo[] = [{
    alto: 9 * INTERLINEA_NATURALE + 6 + 2 * 28 * 1.03 + 6 + altezzaTesto(d.sottotitolo, UTILE_PAGINA, "Helvetica", 10, 1.38) + 12,
  }];
  // Il riquadro: 4 sopra, cornice 16 + 16, etichetta (6 sotto), importo a 24 punti, riga dell'imponibile, nota IVA; 10 sotto.
  pezzi.push({
    alto: 4 + 32 + 9 * INTERLINEA_NATURALE + 6 + 24 * 1.08
      + (d.sconto ? 9 * INTERLINEA_NATURALE + 4 : 0) + 9 * INTERLINEA_NATURALE + (d.sconto ? 2 : 4)
      + 5 + d.righeNotaIva * 7.5 * 1.35
      + (d.rataENetto ? 8.5 + 8 + 8 * INTERLINEA_NATURALE + 2 + 14 * INTERLINEA_NATURALE + 7.5 * INTERLINEA_NATURALE + 1 : 0)
      + 10,
  });
  // L'avviso: 10 sopra e sotto, bordo e cornice, etichetta (4 sotto), scadenza a 12 punti.
  if (d.urgenza) {
    pezzi.push({
      alto: 10 + 2 + 24 + 9 * INTERLINEA_NATURALE + 4 + 12 * INTERLINEA_NATURALE + 10
        + (d.urgenza.descrizione ? 4 + altezzaTesto(d.urgenza.descrizione, UTILE_PAGINA - 26, "Helvetica", 9, 1.4) : 0)
        + (d.urgenza.scontoFirmaPresto ? 6 + 9 * 1.4 : 0),
    });
  }
  if (d.tappe > 0) pezzi.push({ alto: d.tappe <= 4 ? 166 : 67 + 46 * d.tappe });
  if (d.finanziamento) pezzi.push({ alto: 128 });
  return pezzi;
}

// ─── Domande frequenti ────────────────────────────────────────────────────

/** Una domanda con la sua risposta (faqDomanda, faqRisposta e il filetto sotto): `compatta` è lo spazio stretto dei modelli. */
export function altezzaDomanda(domanda: string, risposta: string, compatta: boolean): number {
  // Le domande vengono dal modello dell'azienda: una voce incompleta non deve fermare il PDF.
  return altezzaTesto(String(domanda ?? ""), UTILE_PAGINA, "Helvetica-Bold", 11, INTERLINEA_NATURALE_GRASSETTO) + 4
    + altezzaTesto(String(risposta ?? ""), UTILE_PAGINA, "Helvetica", 10, 1.5)
    + (compatta ? 8 + 5 : 12 + 10) + 0.5;
}

export interface DatiDomande {
  titolo: string;
  intro: string | null;
  voci: Array<{ domanda: string; risposta: string }>;
}

/**
 * Le domande strette (8 punti fra una e l'altra invece di 12) quando così stanno in un foglio e col
 * respiro normale sbordano: le otto di serie sbordavano di una sola, e il foglio dopo restava bianco al 90%
 * (preventivo di Renova, pagina 18). Se non ci stanno nemmeno strette, restano come sono.
 */
export function domandeCompatte(d: DatiDomande): boolean {
  const testa = altezzaTesta(String(d.titolo ?? ""), d.intro ? String(d.intro) : null) + 14;
  const alte = (compatta: boolean) => testa + d.voci.reduce((acc, v, i) => acc + altezzaDomanda(`${i + 1}. ${v?.domanda ?? ""}`, v?.risposta ?? "", compatta), 0);
  return alte(false) > ALTEZZA_UTILE && alte(true) <= ALTEZZA_UTILE - 12;
}

// ─── Dettagli economici ───────────────────────────────────────────────────

/** Il titolo di un riquadro dei dettagli economici (investmentSectionTitle), col margine del riquadro. */
const TITOLO_RIQUADRO = 8 + 10 + 8.8 * 1.2 + 4 + 0.75 + 6;

export interface DatiDettagli {
  titolo: string;
  sottotitolo: string;
  detrazione: { tabella: boolean } | null;
  /** La didascalia sopra il grafico; null senza grafico. */
  recupero: { didascalia: string; pareggio: boolean } | null;
  rate: boolean;
  incluso: Array<{ titolo: string; descrizione?: string | null }>;
  regali: Array<{ titolo: string; valore: boolean }>;
  totaleRegali: boolean;
}

/** Il riquadro di «Cosa è incluso» e dei regali (affiancati se ci sono tutti e due). */
export function altezzaInclusoRegali(d: DatiDettagli): number {
  if (d.incluso.length === 0 && d.regali.length === 0) return 0;
  const affiancati = d.incluso.length > 0 && d.regali.length > 0;
  const largaIncluso = affiancati ? (UTILE_PAGINA - 18) * (1.25 / 2.25) : UTILE_PAGINA;
  const largaRegali = affiancati ? (UTILE_PAGINA - 18) * (1 / 2.25) : UTILE_PAGINA;
  const incluso = d.incluso.length > 0
    ? TITOLO_RIQUADRO + d.incluso.slice(0, 6).reduce((acc, v) => acc + altezzaVoce(v.titolo, v.descrizione, largaIncluso, 10.2, 9.2, 6), 0)
    : 0;
  const regali = d.regali.length > 0
    ? TITOLO_RIQUADRO + d.regali.reduce((acc, r) => {
      const testo = largaRegali - 3 - 16 - (r.valore ? 70 : 0);
      return acc + Math.max(12, righeDiTesto(r.titolo, testo, "Helvetica-Bold", 10) * 10 * INTERLINEA_NATURALE_GRASSETTO) + 16 + 5;
    }, 0) + (d.totaleRegali ? 3 + 8.5 * INTERLINEA_NATURALE_GRASSETTO : 0)
    : 0;
  return Math.max(incluso, regali);
}

/**
 * I riquadri dei dettagli economici con il grafico alto `grafico` punti. Tarati
 * sul preventivo di prova: intestazione 88, detrazione 171 con la tabella degli
 * anni, recupero 228 col grafico da 150, incluso e regali 166.
 */
export function pezziDettagli(d: DatiDettagli, grafico: number): Pezzo[] {
  // Occhiello, titolo a 24 punti (6 sotto) e sottotitolo a 10 punti (12 sotto).
  const pezzi: Pezzo[] = [{
    alto: 9 * INTERLINEA_NATURALE + 6 + altezzaTesto(d.titolo, UTILE_PAGINA, "Helvetica-Bold", 24, 1.05) + 6
      + altezzaTesto(d.sottotitolo, UTILE_PAGINA, "Helvetica", 10, 1.45) + 12,
  }];
  // Riquadro verde (4 sopra, bordo e 10 di cornice): etichetta 15, importo 21,4,
  // «circa … l'anno» 3 + 9,9; con la tabella degli anni 8 + 2 righe da 17,1 e la
  // nota 8 + 8,7.
  if (d.detrazione) pezzi.push({ alto: TITOLO_RIQUADRO + 4 + 21 + 15 + 21.4 + 3 + 9.9 + (d.detrazione.tabella ? 8 + 2 * 17.1 + 8 + 8.7 : 0) });
  if (d.recupero) {
    pezzi.push({
      alto: TITOLO_RIQUADRO - 8 + altezzaTesto(d.recupero.didascalia, UTILE_PAGINA, "Helvetica", 8.2, 1.35) + 2
        + grafico + 2 * 17.1 + (d.recupero.pareggio ? 5 + 7.7 * INTERLINEA_NATURALE : 0),
    });
  }
  if (d.rate) pezzi.push({ alto: TITOLO_RIQUADRO + 4 + 70 + 5 + 2 * 7.7 * INTERLINEA_NATURALE });
  const inclusoRegali = altezzaInclusoRegali(d);
  if (inclusoRegali > 0) pezzi.push({ alto: inclusoRegali });
  return pezzi;
}

/**
 * L'altezza del grafico del recupero: 150 punti, meno quanto serve (fino a 110)
 * perché i dettagli economici stiano in un foglio quando ci stanno per poco.
 * Un grafico un po' più basso è meglio di «Cosa è incluso» da solo su un foglio.
 */
export function altezzaGrafico(d: DatiDettagli): number {
  if (!d.recupero) return 150;
  const totale = pezziDettagli(d, 150).reduce((acc, p) => acc + p.alto, 0);
  const troppo = totale - (ALTEZZA_UTILE - 8);
  if (troppo <= 0 || troppo > 40) return 150;
  return Math.max(110, Math.floor(150 - troppo));
}

// ─── Pagina finale (Pronti per partire) ───────────────────────────────────

export interface DatiCta {
  titoloRiquadro: string;
  passi: string[];
  firmaOnline: boolean;
  note: string | null;
  recensioni: Array<{ testo: string; autore: string }>;
  piede: string | null;
}

export function pezziCta(d: DatiCta): Pezzo[] {
  const pezzi: Pezzo[] = [{ alto: altezzaTesta("Pronti\nper partire.", "Tutto quello che serve per trasformare il preventivo in un intervento programmato.") }];
  const larghi = UTILE_PAGINA - 48 - 28;
  pezzi.push({
    alto: 18 + 48 + altezzaTesto(d.titoloRiquadro.toUpperCase(), UTILE_PAGINA - 48, "Helvetica-Bold", 15, INTERLINEA_NATURALE_GRASSETTO) + 12
      + d.passi.slice(0, 5).reduce((acc, p) => acc + Math.max(18, altezzaTesto(p, larghi, "Helvetica", 10.5, 1.5)) + 9, 0),
  });
  if (d.firmaOnline) pezzi.push({ alto: 14 + 28 + 60 });
  if (d.note) {
    pezzi.push({
      // Riquadro: margine 16, cornice 12 + 12 e bordo; dentro il titolo del gruppo (con 6 sotto invece di 8).
      alto: 16 + 24 + 2 + TITOLO_GRUPPO - 2
        + d.note.split(/\n\n+/).reduce((acc, p) => acc + altezzaTesto(p, UTILE_PAGINA - 26, "Helvetica", 9, 1.55) + 4, 0),
    });
  }
  if (d.recensioni.length > 0) {
    const quante = Math.min(3, d.recensioni.length);
    const larga = (UTILE_PAGINA - 14 * (quante - 1)) / quante - 16;
    const corpo = quante > 1 ? 9.2 : 10;
    const alta = Math.max(...d.recensioni.slice(0, 3).map((r) =>
      altezzaTesto(`“${r.testo}”`, larga, "Helvetica", corpo, quante > 1 ? 1.5 : 1.55) + 4
      + altezzaTesto(`— ${r.autore}`, larga, "Helvetica", 8.5, INTERLINEA_NATURALE) + 4));
    pezzi.push({ alto: TITOLO_GRUPPO + alta });
  }
  if (d.piede) pezzi.push({ alto: 20 + altezzaTesto(d.piede, UTILE_PAGINA, "Helvetica", 8, 1.5) });
  return pezzi;
}
