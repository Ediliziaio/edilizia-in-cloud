/**
 * La pianta generata con l'AI (fase 3, edge function `planimetria-genera`), vista dal
 * browser: cosa mandare, come leggere la risposta, come confermare la scala.
 *
 * La funzione restituisce una pianta già controllata ma NON salvata: la salva la
 * pagina, con l'origine che la funzione indica (`ai_pdf`, `ai_foto`, `ai_testo`…).
 */
import type { OrigineVersione } from "@/lib/planimetrie/archivio";
import type { InfoGenerazione } from "../../../../supabase/functions/planimetria-genera/generazione.ts";
import { applicaMisuraLocale } from "../../../../supabase/functions/planimetria-genera/costruisci.ts";
import { validaPlanimetria } from "../../../../shared/planimetrie/modello.ts";
import type { Planimetria } from "./adattatore";

export type { InfoGenerazione };

export type IngressoAI = "documento" | "schizzo" | "descrizione" | "rilievo";

export const MIME_AMMESSI = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
/** Il file va alla funzione dentro la richiesta: oltre questa misura conviene una foto più leggera. */
export const MASSIMO_BYTES = 10 * 1024 * 1024;

export interface RichiestaAI {
  company_id: string;
  ingresso: IngressoAI;
  testo?: string;
  file_base64?: string;
  mime?: string;
  larghezza?: number;
  altezza?: number;
  /** Solo «rilievo»: foto delle stanze in JPEG, base64 senza intestazione. */
  foto_base64?: string[];
}

/** Una foto di stanza ridotta per l'AI: lato lungo 1280 px, JPEG. Basta per vedere finestre e sanitari. */
export async function fotoPerRilievo(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error("Foto non leggibile.")); img.src = url; });
    const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type EsitoAI =
  | { ok: true; planimetria: Planimetria; generazione: InfoGenerazione; origine: OrigineVersione }
  | { ok: false; messaggio: string; motivo: "crediti" | "non_risponde" | "non_riuscita" | "richiesta" };

const A_MANO = "Puoi sempre disegnarla a mano.";

/** Controlla il file prima di mandarlo: una frase semplice se non va. */
export function fileNonValido(file: { type: string; size: number }): string | null {
  if (!MIME_AMMESSI.includes(file.type)) return "Carica un PDF o una foto (JPG o PNG).";
  if (file.size > MASSIMO_BYTES) return "Il file è troppo grande (massimo 10 MB): prova con una foto più leggera.";
  return null;
}

/**
 * Legge la risposta della funzione. `corpo` è il JSON della risposta (anche quando lo
 * stato non è 2xx), `stato` lo stato HTTP o null se la funzione non ha risposto.
 */
export function leggiRispostaAI(corpo: unknown, stato: number | null): EsitoAI {
  if (stato === null || corpo == null || typeof corpo !== "object") {
    return { ok: false, motivo: "non_risponde", messaggio: `Il servizio non risponde in questo momento: riprova fra qualche minuto. ${A_MANO}` };
  }
  const r = corpo as Record<string, unknown>;
  if (r.success === true) {
    const esito = validaPlanimetria(r.planimetria);
    if (!esito.ok) {
      return { ok: false, motivo: "non_riuscita", messaggio: `La pianta letta non è completa: riprova con un'immagine più nitida. ${A_MANO}` };
    }
    return {
      ok: true,
      planimetria: esito.planimetria,
      generazione: r.generazione as InfoGenerazione,
      origine: (r.origine_versione as OrigineVersione) ?? "importazione",
    };
  }
  const codice = typeof r.codice === "string" ? r.codice : "";
  const testo = typeof r.messaggio === "string" && r.messaggio ? r.messaggio : typeof r.error === "string" ? r.error : "";
  if (stato === 402 || codice === "crediti" || /credit/i.test(testo)) {
    return { ok: false, motivo: "crediti", messaggio: `I crediti AI sono finiti: ricaricali per generare la pianta. ${A_MANO}` };
  }
  if (stato >= 500 || stato === 504 || stato === 429) {
    return { ok: false, motivo: "non_risponde", messaggio: `Il servizio non risponde in questo momento: riprova fra qualche minuto. ${A_MANO}` };
  }
  if (stato === 400 || stato === 413 || stato === 415 || codice === "file" || codice === "richiesta") {
    return { ok: false, motivo: "richiesta", messaggio: testo || "Il file non va bene: carica un PDF o una foto." };
  }
  return { ok: false, motivo: "non_riuscita", messaggio: `${testo || "Non sono riuscito a ricavare la pianta."} ${A_MANO}`.trim() };
}

/** La scala va confermata da una persona: solo sui disegni in scala ha senso farlo qui. */
export function scalaDaConfermare(ingresso: IngressoAI, generazione: InfoGenerazione): boolean {
  return ingresso === "documento" && !!generazione.scala?.da_confermare && generazione.ingresso === "documento";
}

/**
 * «Questa stanza è larga 4,20»: tutta la pianta in scala si adegua (la funzione della
 * fase 3, la stessa usata dal banco di prova). `asse` x = da sinistra a destra.
 */
export function confermaScala(
  planimetria: Planimetria,
  generazione: InfoGenerazione,
  localeId: string,
  asse: "x" | "y",
  valoreCm: number,
): { planimetria: Planimetria; generazione: InfoGenerazione } {
  return applicaMisuraLocale({ planimetria, generazione }, localeId, asse, valoreCm);
}

/** Larghezza e altezza in pixel di un'immagine: senza, la funzione deforma la pianta. */
export function misureImmagine(url: string): Promise<{ larghezza: number; altezza: number } | null> {
  return new Promise((risolvi) => {
    const img = new Image();
    img.onload = () => risolvi({ larghezza: img.naturalWidth, altezza: img.naturalHeight });
    img.onerror = () => risolvi(null);
    img.src = url;
  });
}

export function inBase64(file: Blob): Promise<string> {
  return new Promise((risolvi, rifiuta) => {
    const lettore = new FileReader();
    lettore.onload = () => risolvi(String(lettore.result).split(",")[1] ?? "");
    lettore.onerror = () => rifiuta(lettore.error);
    lettore.readAsDataURL(file);
  });
}

// ─── Preparazione dell'immagine prima della lettura ──────────────────────────
// Schermate di AutoCAD a sfondo nero, foto da 12 megapixel: il modello legge meglio un
// disegno scuro su fondo chiaro, a una misura ragionevole. I PDF partono come sono.

/** Lato più lungo dopo la riduzione: oltre, il modello non vede di più e il file pesa. */
export const LATO_MASSIMO = 2400;

export function misuraRidotta(larghezza: number, altezza: number, massimo = LATO_MASSIMO): { larghezza: number; altezza: number } {
  const k = Math.min(1, massimo / Math.max(larghezza, altezza, 1));
  return { larghezza: Math.round(larghezza * k), altezza: Math.round(altezza * k) };
}

/** Fondo scuro (CAD a sfondo nero, negativo): la luminosità media dei pixel, da 0 a 1. */
export const daInvertire = (luminanzaMedia: number) => luminanzaMedia < 0.4;

export function luminanzaMedia(dati: Uint8ClampedArray, passo = 16): number {
  let somma = 0, n = 0;
  for (let i = 0; i < dati.length; i += 4 * passo) {
    somma += (0.2126 * dati[i] + 0.7152 * dati[i + 1] + 0.0722 * dati[i + 2]) / 255;
    n++;
  }
  return n ? somma / n : 1;
}

/**
 * Il modello di visione legge male le coordinate su un'immagine che non è quadrata: con la stessa pianta
 * e lo stesso disegno, un'immagine larga 1700 × 900 dava stanze grandi la metà del vero (scala 0,66 invece
 * di 1), una quadrata le dava giuste (prova del 02/11/2026 su una pianta disegnata con misure note: 0,99
 * quadrata, 0,50 larga; 0,96 la stessa larga resa quadrata con margini bianchi). Conta la forma, non le
 * dimensioni. Si porta quindi ogni foglio a un quadrato aggiungendo bianco attorno, e il resto
 * (scala, muri) si calcola sui pixel del quadrato: l'origine non conta.
 */
export const serveQuadrato = (larghezza: number, altezza: number) => Math.min(larghezza, altezza) / Math.max(larghezza, altezza, 1) < 0.85;

export interface ImmaginePreparata {
  file: Blob;
  mime: string;
  larghezza: number;
  altezza: number;
  /** Sfondo nero portato a sfondo bianco. */
  invertita: boolean;
}

export type Rotazione = 0 | 90 | 180 | 270;

/** Misura dopo la rotazione: a 90° e 270° larghezza e altezza si scambiano. */
export const misuraRuotata = (larghezza: number, altezza: number, r: Rotazione) =>
  r === 90 || r === 270 ? { larghezza: altezza, altezza: larghezza } : { larghezza, altezza };

/**
 * Riduce, raddrizza (rotazione scelta da chi carica) e, se il fondo è scuro, inverte i colori.
 * Accetta anche una pagina di PDF già disegnata (`sorgente` canvas). Se qualcosa non va: null.
 */
export async function preparaImmagine(file: Blob, rotazione: Rotazione = 0, sorgente?: HTMLCanvasElement): Promise<ImmaginePreparata | null> {
  if (!sorgente && !file.type.startsWith("image/")) return null;
  const url = sorgente ? null : URL.createObjectURL(file);
  try {
    let disegno: CanvasImageSource;
    let w0: number, h0: number;
    if (sorgente) {
      disegno = sorgente; w0 = sorgente.width; h0 = sorgente.height;
    } else {
      const img = new Image();
      await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error("immagine")); img.src = url!; });
      disegno = img; w0 = img.naturalWidth; h0 = img.naturalHeight;
    }
    const ridotta0 = misuraRidotta(w0, h0);
    const m = misuraRuotata(ridotta0.larghezza, ridotta0.altezza, rotazione);
    const canvas = document.createElement("canvas");
    canvas.width = m.larghezza;
    canvas.height = m.altezza;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, m.larghezza, m.altezza);
    ctx.translate(m.larghezza / 2, m.altezza / 2);
    ctx.rotate((rotazione * Math.PI) / 180);
    ctx.drawImage(disegno, -ridotta0.larghezza / 2, -ridotta0.altezza / 2, ridotta0.larghezza, ridotta0.altezza);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const pixel = ctx.getImageData(0, 0, m.larghezza, m.altezza);
    const invertita = daInvertire(luminanzaMedia(pixel.data));
    if (invertita) {
      const d = pixel.data;
      for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
      ctx.putImageData(pixel, 0, 0);
    }
    const quadrato = serveQuadrato(m.larghezza, m.altezza);
    const cambiata = !!sorgente || rotazione !== 0 || ridotta0.larghezza !== w0 || quadrato;
    if (!invertita && !cambiata) return { file, mime: file.type, larghezza: w0, altezza: h0, invertita: false };
    let uscita: HTMLCanvasElement = canvas;
    let larghezzaFinale = m.larghezza;
    let altezzaFinale = m.altezza;
    if (quadrato) {
      // il bianco si aggiunge DOPO aver deciso l'inversione: un CAD scuro con i margini bianchi non sembrerebbe più scuro
      const lato = Math.max(m.larghezza, m.altezza);
      const q = document.createElement("canvas");
      q.width = lato;
      q.height = lato;
      const qc = q.getContext("2d");
      if (!qc) return null;
      qc.fillStyle = "#ffffff";
      qc.fillRect(0, 0, lato, lato);
      qc.drawImage(canvas, Math.round((lato - m.larghezza) / 2), Math.round((lato - m.altezza) / 2));
      uscita = q;
      larghezzaFinale = lato;
      altezzaFinale = lato;
    }
    const blob = await new Promise<Blob | null>((ok) => uscita.toBlob(ok, "image/png"));
    if (!blob || blob.size > MASSIMO_BYTES) return null;
    return { file: blob, mime: "image/png", larghezza: larghezzaFinale, altezza: altezzaFinale, invertita };
  } catch {
    return null;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

/** Disegna una pagina di un PDF (1, 2…) in un canvas, a circa 2400 px sul lato lungo. */
export async function paginaPdf(file: Blob, pagina: number): Promise<{ canvas: HTMLCanvasElement; pagine: number }> {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default as string;
  const caricamento = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await caricamento.promise;
  try {
    const n = Math.min(Math.max(1, pagina), doc.numPages);
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: LATO_MASSIMO / Math.max(base.width, base.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("PDF non disegnato.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return { canvas, pagine: doc.numPages };
  } finally {
    void caricamento.destroy();
  }
}
