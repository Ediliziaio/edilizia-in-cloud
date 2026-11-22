import { readPlanLocally, type PlanText } from "../preventivi/planReading";
import { zonaFotoValida, type LetturaDocumento, type VerificaLettura } from "../../../shared/planimetrie/letturaTipi";
import { analizzaRasterTavola, leggiDatiHvac, scalaRasterHvacDiscordante, type AreaTavola, type TavolaTecnica, type VistaTavolaTecnica } from "./tavolaTecnica";
import type { RicostruzioneCanali } from "./canaliDaTavola";

async function comePng(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((risolvi) => canvas.toBlob(risolvi, "image/png"));
  if (!blob) throw new Error("Non riesco a preparare la vista della tavola.");
  return blob;
}

/** Legge le quote verticali sul margine sinistro, riportando le posizioni all'immagine di partenza. */
async function leggiQuoteVerticaliHvac(canvas: HTMLCanvasElement, area: AreaTavola, signal: AbortSignal) {
  const margine = { x: 0.015, y: Math.max(0, area.y - 0.025), larghezza: 0.071, altezza: Math.min(1, area.y + area.altezza + 0.025) };
  margine.altezza -= margine.y;
  return leggiRiquadroRuotato(canvas, margine, 2, signal);
}

async function leggiRiquadroRuotato(canvas: HTMLCanvasElement, margine: AreaTavola, zoom: number, signal: AbortSignal) {
  const { width: w, height: h } = canvas;
  const larghezza = margine.larghezza * w;
  const altezza = margine.altezza * h;
  const ruotata = document.createElement("canvas");
  const ingrandimento = Math.min(zoom, 2400 / altezza);
  ruotata.width = Math.round(altezza * ingrandimento);
  ruotata.height = Math.round(larghezza * ingrandimento);
  const ctx = ruotata.getContext("2d");
  if (!ctx) return [];
  ctx.translate(ruotata.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(canvas, margine.x * w, margine.y * h, larghezza, altezza, 0, 0, ruotata.height, ruotata.width);
  const lettura = await readPlanLocally(await comePng(ruotata), 1, signal);
  return lettura.lines.map(({ bbox: [x, y, w, h], ...resto }): PlanText => ({
    ...resto,
    bbox: [margine.x + y * margine.larghezza, margine.y + (1 - x - w) * margine.altezza, h * margine.larghezza, w * margine.altezza],
  }));
}

export async function leggiTavolaTecnica(file: Blob, signal: AbortSignal, opzioni: { schizzo?: boolean; quoteVerticali?: boolean } = {}) {
  signal.throwIfAborted();
  const immagine = await createImageBitmap(file);
  const quadro = document.createElement("canvas");
  const riduzione = Math.min(1, 1400 / Math.max(immagine.width, immagine.height));
  quadro.width = Math.max(1, Math.round(immagine.width * riduzione));
  quadro.height = Math.max(1, Math.round(immagine.height * riduzione));
  const contesto = quadro.getContext("2d", { willReadFrequently: true });
  try {
    if (!contesto) throw new Error("Impossibile leggere l’immagine in questo browser.");
    contesto.fillStyle = "white";
    contesto.fillRect(0, 0, quadro.width, quadro.height);
    contesto.drawImage(immagine, 0, 0, quadro.width, quadro.height);
  } finally {
    immagine.close();
  }
  signal.throwIfAborted();
  const immagineRaster = contesto.getImageData(0, 0, quadro.width, quadro.height);
  let righe: PlanText[] = [];
  let etichetteLette = false;
  try {
    const originale = ["image/png", "image/jpeg"].includes(file.type) ? file : await comePng(quadro);
    const lettura = await readPlanLocally(originale, 1, signal);
    righe = lettura.lines;
    etichetteLette = lettura.engine === "Apple Vision locale";
  } catch {
    // L'analisi grafica resta disponibile quando manca il servizio di riconoscimento testo.
    signal.throwIfAborted();
  }
  const tavola = analizzaRasterTavola(immagineRaster.data, quadro.width, quadro.height, righe, opzioni.schizzo);
  if (opzioni.quoteVerticali && etichetteLette && tavola.tipo === "hvac" && tavola.dati.orizzontale && tavola.colori) {
    try {
      const verticali = await leggiQuoteVerticaliHvac(quadro, tavola.area, signal);
      tavola.dati = leggiDatiHvac(righe, tavola.area, verticali);
    } catch {
      signal.throwIfAborted();
    }
  }
  signal.throwIfAborted();
  return { tavola, immagineRaster, righe, etichetteLette };
}

export type LetturaTavolaTecnica = Awaited<ReturnType<typeof leggiTavolaTecnica>>;

export async function leggiSezioniVerticali(lettura: LetturaTavolaTecnica, studio: RicostruzioneCanali, signal: AbortSignal) {
  if (!lettura.etichetteLette) return [];
  const canvas = document.createElement("canvas");
  canvas.width = studio.larghezza;
  canvas.height = studio.altezza;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.putImageData(lettura.immagineRaster, 0, 0);
  const risultati: PlanText[] = [];
  for (const rete of ["mandata", "ripresa"] as const) {
    const candidati = studio.tratti.filter((t) => t.rete === rete && t.da.x === t.a.x && t.a.y - t.da.y > 0.12)
      .sort((a, b) => b.a.y - b.da.y - (a.a.y - a.da.y)).slice(0, 2);
    for (const t of candidati) {
      signal.throwIfAborted();
      const x = Math.max(0, t.da.x - 0.022);
      const lunghezza = t.a.y - t.da.y;
      try {
        risultati.push(...await leggiRiquadroRuotato(canvas,
          { x, y: t.da.y + lunghezza * 0.09, larghezza: Math.min(0.044, 1 - x), altezza: lunghezza * 0.82 }, 3, signal));
      } catch {
        signal.throwIfAborted();
      }
    }
  }
  return risultati;
}

/** Disegna una vista diagnostica mantenendo le stesse coordinate dell'originale. */
export async function immagineVistaTecnica(analisi: LetturaTavolaTecnica, vista: VistaTavolaTecnica) {
  const { tavola, immagineRaster } = analisi;
  if (tavola.tipo !== "hvac" || !tavola.colori || !tavola.segniEsclusi) return null;
  const { area, colori, segniEsclusi, codiceMandata } = tavola;
  const { width, height, data } = immagineRaster;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const contesto = canvas.getContext("2d");
  if (!contesto) return null;
  const uscita = contesto.createImageData(width, height);
  const codice = vista === "mandata" ? codiceMandata || 1 : 3 - (codiceMandata || 1);
  const sopra = Math.ceil(area.y * height);
  const sotto = Math.floor((area.y + area.altezza) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const j = i * 4;
      const interno = y >= sopra && y < sotto;
      if (vista !== "pianta" && interno && colori[i] === codice) {
        uscita.data[j] = data[j];
        uscita.data[j + 1] = data[j + 1];
        uscita.data[j + 2] = data[j + 2];
      } else {
        const grigio = Math.round(data[j] * 0.2126 + data[j + 1] * 0.7152 + data[j + 2] * 0.0722);
        const tono = !interno || segniEsclusi[i] ? 255 : vista === "pianta" ? grigio : 211 + grigio * 0.17;
        uscita.data[j] = uscita.data[j + 1] = uscita.data[j + 2] = tono;
      }
      uscita.data[j + 3] = 255;
    }
  }
  contesto.putImageData(uscita, 0, 0);
  return comePng(canvas);
}

export function verificheTavolaTecnica(tavola: TavolaTecnica, ritaglioConsigliato: boolean): LetturaDocumento | undefined {
  const verifiche: VerificaLettura[] = [];
  if (tavola.tipo === "composita" && ritaglioConsigliato) {
    verifiche.push({ id: "tavola-ritaglio", tipo: "geometria", descrizione: "Confronta il contorno e le aperture della pianta ritagliata con il foglio intero.", zoneFoto: [tavola.area] });
    verifiche.push({ id: "tavola-scala", tipo: "quota", descrizione: "Leggi le quote minute sulla tavola originale e imposta la scala del ricalco." });
  }
  if (tavola.tipo === "hvac") {
    verifiche.push({ id: "hvac-architettura", tipo: "geometria", descrizione: "Verifica sulla tavola architettonica le pareti e le aperture coperte dai canali." });
    verifiche.push({ id: "hvac-rete", tipo: "nota", descrizione: "Verifica i collegamenti, le lunghezze e le quote di posa dei canali prima di ricavare le quantità." });
    if (scalaRasterHvacDiscordante(tavola)) verifiche.push({
      id: "hvac-scala-foto", tipo: "quota", descrizione: "Le quote scritte indicano una possibile differenza di scala tra i due assi della foto. Controlla entrambi gli assi sul disegno originale.",
    });
    for (const [id, asse, q] of [
      ["x", "orizzontale", tavola.dati.orizzontale], ["y", "verticale", tavola.dati.verticale],
    ] as const) {
      if (!q) continue;
      verifiche.push({ id: `hvac-asse-${id}`, tipo: "quota", descrizione: `Conferma la quota d’asse ${asse} di ${q.totaleMm / 1000} m sulla tavola originale.`,
        valoriLettiCm: [q.totaleMm / 10], zoneFoto: [q.zona].filter(zonaFotoValida) });
    }
    const portate = tavola.dati.portate;
    if (portate.length) {
      const somma = portate.reduce((totale, p) => totale + p.cfm, 0);
      verifiche.push({ id: "hvac-portate", tipo: "nota",
        descrizione: `Verifica le ${portate.length} portate lette in tavola, per un totale di ${somma} CFM.` });
    }
    if (tavola.dati.sezioni.length || tavola.dati.sigleDaVerificare) {
      const sezioni = tavola.dati.sezioni.slice(0, 15).map((s) => `${s.rete} ${s.larghezzaMm} × ${s.altezzaMm} mm`);
      const incomplete = tavola.dati.sigleDaVerificare ? ` Controlla anche le ${tavola.dati.sigleDaVerificare} letture incomplete.` : "";
      verifiche.push({ id: "hvac-sezioni", tipo: "nota",
        descrizione: `Confronta le sezioni dei canali con la tavola${sezioni.length ? ` (${sezioni.join(", ")})` : ""}.${incomplete}` });
    }
    const ripetute = new Map<string, AreaTavola[]>();
    for (const p of portate) if (p.nome) ripetute.set(p.nome, [...(ripetute.get(p.nome) ?? []), p.zona]);
    [...ripetute].filter(([, zone]) => zone.length > 1).forEach(([nome, zone], indice) => {
      verifiche.push({ id: `hvac-etichetta-${indice + 1}`, tipo: "nota", descrizione: `Identifica gli ambienti indicati con la stessa etichetta «${nome}» sulla tavola.`,
        zoneFoto: zone.filter(zonaFotoValida).slice(0, 8) });
    });
  }
  if (!verifiche.length) return undefined;
  return { avvisiIniziali: [], superficiScritteMq: {}, verifiche };
}
