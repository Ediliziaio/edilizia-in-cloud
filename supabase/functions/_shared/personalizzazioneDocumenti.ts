/**
 * La veste dei PDF per le aziende che ne hanno una propria (09/11/2026).
 *
 * Oggi solo Impresa Vulcano: logo molto più grande e piè di pagina in EB Garamond blu scuro. Dal 10/11/2026 anche
 * il contenuto del piè è il suo: le quattro righe dell'esempio mandato dal titolare (`piedeRighe`), al posto delle
 * righeSocietarie. Per tutte le altre il valore neutro lascia ogni documento com'era.
 *
 * Modulo puro: lo importano frontend, edge e bundle. Misure in punti PDF.
 */
/** Un pezzo di una riga del piè: il testo, scritto così com'è, e se serve un colore suo e la sottolineatura. */
export interface PartePiede {
  testo: string;
  colore?: string;
  sottolineato?: boolean;
}

/** Una riga del piè. `titolo`: la ragione sociale, più grande delle altre. */
export interface RigaPiede {
  parti: readonly PartePiede[];
  titolo?: boolean;
}

export interface PersonalizzazioneDocumento {
  /** Il logo nelle pagine interne. */
  logoAltezza: number | null;
  logoLarghezzaMax: number | null;
  /** Il logo in copertina o in prima pagina. */
  logoCopertinaAltezza: number | null;
  logoCopertinaLarghezzaMax: number | null;
  piedeFont: string | null;
  piedeColore: string | null;
  /** Le righe del piè al posto dei dati societari; null = il piè di sempre. */
  piedeRighe: readonly RigaPiede[] | null;
}

export const SENZA_PERSONALIZZAZIONE: PersonalizzazioneDocumento = Object.freeze({
  logoAltezza: null,
  logoLarghezzaMax: null,
  logoCopertinaAltezza: null,
  logoCopertinaLarghezzaMax: null,
  piedeFont: null,
  piedeColore: null,
  piedeRighe: null,
});

const IMPRESA_VULCANO = "7c87c209-7868-42d0-ad98-6c95ac6de196";

export const FONT_EB_GARAMOND = "EB Garamond";

// Logo 6,17:1: a 340 punti si leggono nome e marchi di certificazione.
const VESTE_VULCANO: PersonalizzazioneDocumento = Object.freeze({
  logoAltezza: 55,
  logoLarghezzaMax: 340,
  logoCopertinaAltezza: 75,
  logoCopertinaLarghezzaMax: 460,
  piedeFont: FONT_EB_GARAMOND,
  piedeColore: "#1C1650",
  // Dall'esempio del titolare (10/11/2026), parola per parola: «–» nelle sedi, «/» fra le due, quattro spazi fra
  // P.IVA e telefono. L'email in azzurro sottolineata, come nell'esempio; il resto nel blu del piè.
  piedeRighe: Object.freeze([
    { titolo: true, parti: [{ testo: "Impresa Vulcano s.r.l." }] },
    { parti: [{ testo: "Sede Legale: Via Marconi, 35 – Lonate Pozzolo (VA) / Sede Operativa: Via dei Mille, 3 – Vanzaghello (MI)" }] },
    { parti: [{ testo: "info@impresavulcano.it", colore: "#3B82C4", sottolineato: true }, { testo: " - www.impresavulcano.it" }] },
    { parti: [{ testo: "C.F./P.IVA 06923340969    tel. 0331/1409144" }] },
  ]),
});

export function personalizzazioneDocumento(companyId: string | null | undefined): PersonalizzazioneDocumento {
  return companyId === IMPRESA_VULCANO ? VESTE_VULCANO : SENZA_PERSONALIZZAZIONE;
}

/** Il testo intero di una riga del piè. */
export const testoRigaPiede = (r: RigaPiede): string => r.parti.map((p) => p.testo).join("");

/**
 * Larghezza, a corpo 1, della riga più lunga del piè di Vulcano (la riga delle sedi), misurata il 10/11/2026: 40,2
 * in EB Garamond, 43,2 in Times, il ripiego quando il carattere non si scarica. Si tiene la peggiore.
 */
const LARGHEZZA_RIGA_LUNGA_A_CORPO_1 = 43.3;

export interface MisurePiede {
  corpoTitolo: number;
  corpo: number;
  /** Altezza della riga del titolo e delle altre (corpo × interlinea). */
  rigaTitolo: number;
  riga: number;
  /** Le righe tutte insieme. */
  altezza: number;
  /** Il numero di pagina: corpo e distanza della sua cima dal fondo del foglio. */
  corpoPagina: number;
  cimaPaginaDalFondo: number;
  /** Il fondo delle righe, dal fondo del foglio. */
  fondoRigheDalFondo: number;
  /** Dove comincia il piè, dal fondo del foglio: il contenuto deve restare sopra, con un po' di bianco. */
  ingombro: number;
}

/**
 * Le misure del piè proprio, in punti, per una larghezza utile data. Le righe 2-4 stanno a 7 punti e scendono
 * insieme se la più lunga non ci sta: mai a capo. Il titolo a 10,5 (ridotti il 10/11/2026 su richiesta del titolare: occupava troppo).
 */
export function misurePiede(veste: PersonalizzazioneDocumento, larghezzaUtile: number): MisurePiede | null {
  const righe = veste.piedeRighe;
  if (!righe?.length) return null;
  const corpo = Math.min(7, Math.floor((larghezzaUtile / LARGHEZZA_RIGA_LUNGA_A_CORPO_1) * 4) / 4);
  const corpoTitolo = 10.5;
  const rigaTitolo = corpoTitolo * 1.15;
  const riga = corpo * 1.25;
  const altezza = righe.reduce((s, r) => s + (r.titolo ? rigaTitolo : riga), 0);
  const corpoPagina = 6.5;
  const cimaPaginaDalFondo = 20;
  const fondoRigheDalFondo = cimaPaginaDalFondo + 1;
  return { corpoTitolo, corpo, rigaTitolo, riga, altezza, corpoPagina, cimaPaginaDalFondo, fondoRigheDalFondo, ingombro: fondoRigheDalFondo + altezza };
}

/** Il bianco minimo fra il contenuto e il piè proprio. */
const BIANCO_SOPRA_PIEDE = 8;

/**
 * Il margine inferiore delle pagine: quello del documento, o di più se il piè proprio è più alto. Per chi non ha un
 * piè proprio è sempre `margine`.
 */
export function margineInferiorePiede(companyId: string | null | undefined, margine: number, larghezzaUtile = 495): number {
  const m = misurePiede(personalizzazioneDocumento(companyId), larghezzaUtile);
  return m ? Math.max(margine, Math.ceil(m.ingombro + BIANCO_SOPRA_PIEDE)) : margine;
}

/** Quanto di jsPDF serve per disegnare il piè: lo usano ordini/RDO e varianti. */
interface PdfPerPiede {
  setFont(nome: string, stile?: string): unknown;
  setFontSize(corpo: number): unknown;
  setTextColor(colore: string): unknown;
  setDrawColor(colore: string): unknown;
  setLineWidth(spessore: number): unknown;
  getTextWidth(testo: string): number;
  text(testo: string, x: number, y: number, opzioni?: { align?: "center" | "left" | "right" }): unknown;
  line(x1: number, y1: number, x2: number, y2: number): unknown;
}

/**
 * Il piè proprio su una pagina jsPDF in millimetri (A4), centrato, e sotto il numero di pagina. `font`: il carattere
 * già registrato, o quello di serie se non si è scaricato (e allora il testo passa da `pulisci`). Le righe 2-4 scendono
 * di corpo insieme finché la più lunga ci sta. Il contenuto resta sopra `limiteContenutoJsPdf`.
 */
export function disegnaPiedeJsPdf(pdf: PdfPerPiede, veste: PersonalizzazioneDocumento, o: {
  font: string; pulisci?: (testo: string) => string; larghezzaUtile: number; pagina: string;
}): void {
  const righe = veste.piedeRighe;
  const m = misurePiede(veste, (o.larghezzaUtile * 72) / 25.4);
  if (!righe?.length || !m) return;
  const testo = (t: string) => (o.pulisci ? o.pulisci(t) : t);
  const colore = veste.piedeColore ?? "#1C1650";
  pdf.setFont(o.font, "normal");
  let corpo = m.corpo;
  pdf.setFontSize(corpo);
  const piuLunga = Math.max(...righe.filter((r) => !r.titolo).map((r) => pdf.getTextWidth(testo(testoRigaPiede(r)))));
  if (piuLunga > o.larghezzaUtile) corpo = (corpo * o.larghezzaUtile) / piuLunga;
  const mm = (punti: number) => (punti * 25.4) / 72;
  const fondoFoglio = 297;
  // La linea di base di ogni riga: dal fondo delle righe verso l'alto, a circa un quarto di riga dal fondo della sua.
  let fondo = fondoFoglio - mm(m.fondoRigheDalFondo);
  const basi: number[] = [];
  for (let i = righe.length - 1; i >= 0; i--) {
    const alta = righe[i].titolo ? m.rigaTitolo : (corpo * 1.25);
    basi[i] = fondo - mm(alta * 0.27);
    fondo -= mm(alta);
  }
  righe.forEach((r, i) => {
    const c = r.titolo ? m.corpoTitolo : corpo;
    pdf.setFontSize(c);
    const pezzi = r.parti.map((p) => ({ ...p, testo: testo(p.testo), larghezza: 0 }));
    for (const p of pezzi) p.larghezza = pdf.getTextWidth(p.testo);
    let x = 105 - pezzi.reduce((s, p) => s + p.larghezza, 0) / 2;
    for (const p of pezzi) {
      pdf.setTextColor(p.colore ?? colore);
      pdf.text(p.testo, x, basi[i]);
      if (p.sottolineato) {
        pdf.setDrawColor(p.colore ?? colore);
        pdf.setLineWidth(mm(c * 0.05));
        pdf.line(x, basi[i] + mm(c * 0.12), x + p.larghezza, basi[i] + mm(c * 0.12));
      }
      x += p.larghezza;
    }
  });
  pdf.setFontSize(m.corpoPagina);
  pdf.setTextColor(colore);
  pdf.text(testo(o.pagina), 105, fondoFoglio - mm(m.cimaPaginaDalFondo) + mm(m.corpoPagina * 0.8), { align: "center" });
}

/** Il margine inferiore (mm) di una pagina jsPDF col piè proprio: sotto questa quota il contenuto non scende. */
export function limiteContenutoJsPdf(veste: PersonalizzazioneDocumento, larghezzaUtileMm: number, limite: number): number {
  const m = misurePiede(veste, (larghezzaUtileMm * 72) / 25.4);
  if (!m) return limite;
  return Math.min(limite, 297 - ((m.ingombro + BIANCO_SOPRA_PIEDE) * 25.4) / 72);
}

/** Punti PDF in millimetri, per i documenti disegnati con jsPDF. */
export const puntiInMm = (punti: number): number => (punti * 25.4) / 72;

// «?v=2»: alcuni nodi di Cloudflare tengono in cache, per un anno, la risposta avuta prima che il file esistesse.
export const PERCORSO_FONT_PIEDE = "/fonts/EBGaramond-Regular.ttf?v=2";

/** Nel browser il file dello stesso sito (vale anche sulle anteprime); sul server l'indirizzo pubblico. */
export function urlFontPiede(): string {
  try {
    const origine = (globalThis as { location?: { origin?: string } }).location?.origin;
    if (origine && /^https?:/.test(origine)) return `${origine}${PERCORSO_FONT_PIEDE}`;
  } catch { /* Deno senza --location: la lettura stessa lancia. */ }
  return `https://app.ediliziaincloud.com${PERCORSO_FONT_PIEDE}`;
}

let fontBase64: Promise<string | null> | null = null;

/**
 * Il TTF in base64 per jsPDF, scaricato una volta. null se non si carica: il documento esce col carattere di serie
 * (e al prossimo si riprova).
 */
export function fontPiedeBase64(): Promise<string | null> {
  fontBase64 ??= (async () => {
    try {
      const risposta = await fetch(urlFontPiede(), { signal: AbortSignal.timeout(8000) });
      if (!risposta.ok) throw new Error(String(risposta.status));
      const byte = new Uint8Array(await risposta.arrayBuffer());
      // Un TTF comincia con 00 01 00 00: una pagina HTML al suo posto non è un carattere.
      if (byte[0] !== 0 || byte[1] !== 1) throw new Error("non è un TTF");
      let binario = "";
      for (let i = 0; i < byte.length; i += 8192) binario += String.fromCharCode(...byte.subarray(i, i + 8192));
      return btoa(binario);
    } catch {
      fontBase64 = null;
      return null;
    }
  })();
  return fontBase64;
}
