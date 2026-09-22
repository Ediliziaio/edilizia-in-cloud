/**
 * Quanto occupa un testo nel PDF, senza disegnarlo.
 *
 * Le larghezze sono quelle vere dei caratteri standard del PDF (millesimi di em,
 * dalle metriche Adobe che usa react-pdf): con queste il documento sa in anticipo
 * su quante righe va un testo, e quindi quanto spazio resta in fondo a una
 * pagina. Serve a riempire le mezze pagine con una foto invece di lasciarle
 * bianche: react-pdf non dice dove finisce una pagina, e una foto che si allarga
 * da sola (flexGrow) rompe l'impaginazione (vedi DocumentoEdilePDF).
 *
 * Rigenerabile con .audit/larghezze.ts (pdfkit, widthOfString a corpo 1000).
 */

export type FamigliaPdf = "Helvetica" | "Helvetica-Bold" | "Times-Roman" | "Times-Bold" | "Times-Italic";

const CARATTERI = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~àèéìíòóùÀÈÉÌÒÙ«»’‘“”–—€°·•×ç";

const LARGHEZZE: Record<FamigliaPdf, readonly number[]> = {
  "Helvetica": [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,556,556,556,278,278,556,556,556,667,667,667,278,778,722,556,556,222,222,333,333,556,1000,556,400,278,350,584,500],
  "Helvetica-Bold": [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,556,556,556,278,278,611,611,611,722,667,667,278,778,722,556,556,278,278,500,500,556,1000,556,400,278,350,584,556],
  "Times-Roman": [250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444,480,200,480,541,444,444,444,278,278,500,500,500,722,611,611,333,722,722,500,500,333,333,444,444,500,1000,500,400,250,350,564,444],
  "Times-Bold": [250,333,555,500,500,1000,833,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,930,722,667,722,722,667,611,778,778,389,500,778,667,944,722,778,611,778,722,556,667,722,722,1000,722,722,667,333,278,333,581,500,333,500,556,444,556,444,333,500,556,278,333,556,278,833,556,500,556,556,444,389,333,556,500,722,500,500,444,394,220,394,520,500,444,444,278,278,500,500,556,722,667,667,389,778,722,500,500,333,333,500,500,500,1000,500,400,250,350,570,444],
  "Times-Italic": [250,333,420,500,500,833,778,214,333,333,500,675,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,675,675,675,500,920,611,611,667,722,611,611,722,722,333,444,667,556,833,667,722,611,722,611,500,556,722,611,833,611,556,556,389,278,389,422,500,333,500,500,444,500,444,278,500,500,278,278,444,278,722,500,500,500,500,389,389,278,500,444,667,444,444,389,400,275,400,541,500,444,444,278,278,500,500,500,611,611,611,333,722,722,500,500,333,333,556,556,500,889,500,400,250,350,675,444],
};

const INDICE = new Map([...CARATTERI].map((c, i) => [c, i]));

/** Larghezza in punti di un testo su una riga. Un carattere sconosciuto vale mezzo em. */
export function larghezzaTesto(testo: string, famiglia: FamigliaPdf, corpo: number): number {
  const tabella = LARGHEZZE[famiglia] ?? LARGHEZZE.Helvetica;
  let millesimi = 0;
  for (const c of testo) {
    const i = INDICE.get(c);
    millesimi += i === undefined ? 500 : tabella[i];
  }
  return (millesimi * corpo) / 1000;
}

/**
 * Su quante righe va un testo largo al massimo `larghezza` punti: si va a capo
 * fra una parola e l'altra, come fa il motore, e un a capo del testo conta.
 * Una parola più lunga della riga ne occupa più d'una.
 */
export function righeDiTesto(testo: string, larghezza: number, famiglia: FamigliaPdf, corpo: number): number {
  const spazio = larghezzaTesto(" ", famiglia, corpo);
  let totale = 0;
  for (const paragrafo of String(testo ?? "").split("\n")) {
    let righe = 1;
    let x = 0;
    for (const parola of paragrafo.split(/\s+/).filter(Boolean)) {
      const w = larghezzaTesto(parola, famiglia, corpo);
      if (x === 0) {
        righe += Math.max(0, Math.ceil(w / larghezza) - 1);
        x = w % larghezza || w;
      } else if (x + spazio + w <= larghezza) {
        x += spazio + w;
      } else {
        righe += 1;
        x = w;
      }
    }
    totale += righe;
  }
  return Math.max(1, totale);
}

/** Altezza in punti di un blocco di testo: righe per corpo per interlinea. */
export function altezzaTesto(testo: string, larghezza: number, famiglia: FamigliaPdf, corpo: number, interlinea = 1.2): number {
  return righeDiTesto(testo, larghezza, famiglia, corpo) * corpo * interlinea;
}

/** Il testo di un HTML semplice (paragrafi, elenchi), con un a capo per ogni blocco. */
export function testoDaHtml(html: string | null | undefined): string {
  return String(html ?? "")
    .replace(/<\s*(br|\/p|\/li|\/h[1-6]|\/div)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}
