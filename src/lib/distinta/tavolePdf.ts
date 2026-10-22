/**
 * Lettura delle tavole PDF nel browser con pdfjs:
 *   - estraiTestoTavola: tutte le scritte con la loro posizione (per contare
 *     le sigle e trovare i nomi dei locali e la legenda);
 *   - disegnaRiquadri: la tavola disegnata a riquadri JPEG, per far contare
 *     all'AI i simboli disegnati. Una tavola Archicad di 275×165 cm con
 *     centinaia di migliaia di linee non si disegna intera in un'immagine
 *     leggibile: a riquadri sì.
 */
import type { TestoTavola } from "./conteggioTesto";

async function pdfjs() {
  const lib = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  if (typeof worker === "string" && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = worker;
  return lib;
}

export interface TestoEstratto {
  testi: TestoTavola[];
  pagine: { numero: number; larghezza: number; altezza: number }[];
}

export async function estraiTestoTavola(byte: Uint8Array): Promise<TestoEstratto> {
  const lib = await pdfjs();
  const caricamento = lib.getDocument({ data: byte.slice() });
  try {
    const doc = await caricamento.promise;
    const testi: TestoTavola[] = [];
    const pagine: TestoEstratto["pagine"] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const pagina = await doc.getPage(p);
      const vista = pagina.getViewport({ scale: 1 });
      pagine.push({ numero: p, larghezza: vista.width, altezza: vista.height });
      const contenuto = await pagina.getTextContent();
      for (const it of contenuto.items) {
        if (!("str" in it) || !it.str.trim()) continue;
        const [a, b, c, d, x, y] = it.transform as number[];
        testi.push({ s: it.str, x, y, h: Math.hypot(c, d) || Math.hypot(a, b), pagina: p });
      }
    }
    return { testi, pagine };
  } finally {
    await caricamento.destroy();
  }
}

export interface Riquadro {
  pagina: number;
  riga: number;
  colonna: number;
  /** data:image/jpeg;base64,… */
  immagine: string;
  /** Quota di pixel non bianchi: sotto lo 0,3 % il riquadro è vuoto e non si manda. */
  pieno: number;
}

/**
 * Disegna la pagina a riquadri di `lato` punti PDF, ognuno a `scala`
 * (1,3 → un riquadro di 1.300 punti diventa ~1.700 pixel). Chiama `suRiquadro`
 * appena un riquadro è pronto, così si può spedire mentre si disegna il
 * successivo.
 */
export async function disegnaRiquadri(
  byte: Uint8Array,
  opzioni: { pagina?: number; lato?: number; scala?: number; segnale?: AbortSignal },
  suRiquadro: (r: Riquadro, totale: number) => Promise<void> | void,
): Promise<number> {
  const lib = await pdfjs();
  const caricamento = lib.getDocument({ data: byte.slice() });
  try {
    const doc = await caricamento.promise;
    const pagina = await doc.getPage(opzioni.pagina ?? 1);
    const scala = opzioni.scala ?? 1.3;
    const lato = opzioni.lato ?? 1300;
    const base = pagina.getViewport({ scale: 1 });
    const colonne = Math.ceil(base.width / lato);
    const righe = Math.ceil(base.height / lato);
    const totale = righe * colonne;
    const tela = document.createElement("canvas");
    tela.width = Math.ceil(lato * scala);
    tela.height = Math.ceil(lato * scala);
    const ctx = tela.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Il browser non riesce a disegnare la tavola");
    for (let r = 0; r < righe; r++) {
      for (let c = 0; c < colonne; c++) {
        if (opzioni.segnale?.aborted) return totale;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, tela.width, tela.height);
        const vista = pagina.getViewport({ scale: scala, offsetX: -c * lato * scala, offsetY: -r * lato * scala });
        await pagina.render({ canvasContext: ctx, viewport: vista, canvas: tela } as never).promise;
        const dati = ctx.getImageData(0, 0, tela.width, tela.height).data;
        let scuri = 0;
        for (let i = 0; i < dati.length; i += 16) if (dati[i] < 200 || dati[i + 1] < 200 || dati[i + 2] < 200) scuri++;
        const pieno = scuri / (dati.length / 16);
        await suRiquadro({ pagina: opzioni.pagina ?? 1, riga: r + 1, colonna: c + 1, immagine: tela.toDataURL("image/jpeg", 0.82), pieno }, totale);
      }
    }
    return totale;
  } finally {
    await caricamento.destroy();
  }
}

/** Somma i conteggi dei riquadri: quantità sommate, confidenza = la più bassa pesata per quantità. */
export function sommaRiquadri(
  parziali: { simbolo: string; quantita: number; confidenza: number }[][],
): { simbolo: string; quantita: number; confidenza: number; riquadri: number }[] {
  const m = new Map<string, { quantita: number; pesata: number; riquadri: number }>();
  for (const riquadro of parziali) {
    for (const s of riquadro) {
      const g = m.get(s.simbolo) ?? { quantita: 0, pesata: 0, riquadri: 0 };
      g.quantita += s.quantita;
      g.pesata += s.quantita * s.confidenza;
      g.riquadri += 1;
      m.set(s.simbolo, g);
    }
  }
  return [...m.entries()]
    .map(([simbolo, g]) => ({
      simbolo,
      quantita: g.quantita,
      confidenza: g.quantita > 0 ? Math.round((g.pesata / g.quantita) * 1000) / 1000 : 0,
      riquadri: g.riquadri,
    }))
    .sort((a, b) => b.quantita - a.quantita);
}
