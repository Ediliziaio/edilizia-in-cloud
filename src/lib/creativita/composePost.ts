/**
 * composePost — da immagine generata a POST PUBBLICABILE.
 *
 * L'AI produce una foto: senza titolo, senza logo e nel formato che il modello
 * sa generare (mai 9:16 nativo). Questo modulo chiude i 200 metri finali:
 *   1. porta l'immagine alla dimensione social REALE con un crop centrato
 *      (altrimenti è Instagram a ritagliare, in un punto che non scegliamo);
 *   2. sovrappone headline, CTA e logo aziendale con i colori del brand.
 *
 * Gira nel browser (Canvas 2D): niente librerie, niente costi, anteprima
 * immediata e nessun round-trip verso le edge function.
 *
 * La geometria del crop e i formati vivono in brandCreativeRules.ts, condivisi
 * col backend e coperti da test.
 */

import {
  SOCIAL_TARGET_SIZE,
  cropCoverBox,
  type CreativeAspect,
} from "../../../supabase/functions/_shared/brandCreativeRules";

export interface PostOverlay {
  /** Titolo grande, 2-3 parole chiave. Vuoto = nessun titolo. */
  headline?: string;
  /** Riga di richiamo sotto il titolo (es. "Preventivo gratuito"). */
  cta?: string;
  /** URL del logo aziendale (PNG/SVG con trasparenza). */
  logoUrl?: string | null;
  /** Colore del brand per la barra/CTA. Default: arancione EiC. */
  colorePrimario?: string | null;
  /** Posizione del blocco testo. */
  posizione?: "alto" | "basso";
}

export interface ComposeResult {
  /** PNG pronto per il download o l'upload. */
  blob: Blob;
  /** Object URL per l'anteprima (chi lo usa deve revocarlo). */
  previewUrl: string;
  width: number;
  height: number;
}

const COLORE_DEFAULT = "#ea580c";

/** Carica un'immagine gestendo la CORS (le nostre sono su bucket pubblico). */
function caricaImmagine(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Immagine non caricabile (CORS o URL non valido)"));
    img.src = url;
  });
}

/**
 * Manda a capo il testo rispettando la larghezza disponibile.
 * Una parola più lunga della riga resta sulla sua riga (meglio sbordare di
 * pochissimo che spezzare una parola a metà in una grafica).
 */
export function spezzaRighe(
  ctx: CanvasRenderingContext2D,
  testo: string,
  larghezzaMax: number,
): string[] {
  const parole = testo.trim().split(/\s+/).filter(Boolean);
  if (parole.length === 0) return [];
  const righe: string[] = [];
  let corrente = parole[0];
  for (let i = 1; i < parole.length; i++) {
    const tentativo = `${corrente} ${parole[i]}`;
    if (ctx.measureText(tentativo).width <= larghezzaMax) {
      corrente = tentativo;
    } else {
      righe.push(corrente);
      corrente = parole[i];
    }
  }
  righe.push(corrente);
  return righe;
}

/**
 * Compone il post finale.
 *
 * Il testo va su una sfumatura scura: è l'unico modo per garantire leggibilità
 * sopra una foto qualsiasi senza sapere in anticipo se è chiara o scura.
 */
export async function composePost(
  imageUrl: string,
  aspect: CreativeAspect,
  overlay: PostOverlay = {},
): Promise<ComposeResult> {
  const target = SOCIAL_TARGET_SIZE[aspect] ?? SOCIAL_TARGET_SIZE["1:1"];
  const img = await caricaImmagine(imageUrl);

  const canvas = document.createElement("canvas");
  canvas.width = target.w;
  canvas.height = target.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile in questo browser");

  // 1. Immagine al formato social esatto (crop centrato)
  const box = cropCoverBox({ w: img.naturalWidth, h: img.naturalHeight }, target);
  ctx.drawImage(img, box.sx, box.sy, box.sw, box.sh, 0, 0, target.w, target.h);

  const headline = (overlay.headline ?? "").trim();
  const cta = (overlay.cta ?? "").trim();
  const colore = overlay.colorePrimario || COLORE_DEFAULT;
  const inAlto = overlay.posizione === "alto";
  const margine = Math.round(target.w * 0.06);

  if (headline || cta) {
    // 2. Sfumatura di leggibilità sul lato del testo
    const altezzaVelo = Math.round(target.h * 0.42);
    const gradiente = inAlto
      ? ctx.createLinearGradient(0, 0, 0, altezzaVelo)
      : ctx.createLinearGradient(0, target.h, 0, target.h - altezzaVelo);
    gradiente.addColorStop(0, "rgba(0,0,0,0.72)");
    gradiente.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradiente;
    ctx.fillRect(0, inAlto ? 0 : target.h - altezzaVelo, target.w, altezzaVelo);

    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    let y = inAlto ? margine : 0; // per il basso calcoliamo dopo l'altezza totale

    // 3. Headline
    const dimTitolo = Math.round(target.w * 0.082);
    ctx.font = `800 ${dimTitolo}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const righe = headline ? spezzaRighe(ctx, headline, target.w - margine * 2) : [];
    const interlinea = Math.round(dimTitolo * 1.16);
    const dimCta = Math.round(target.w * 0.038);
    const altezzaCta = cta ? Math.round(dimCta * 2.6) : 0;
    const altezzaBlocco = righe.length * interlinea + (cta ? altezzaCta + Math.round(margine * 0.5) : 0);

    if (!inAlto) y = target.h - margine - altezzaBlocco;

    ctx.fillStyle = "#ffffff";
    // Ombra morbida: stacca il bianco anche sopra una zona chiara della foto
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = Math.round(dimTitolo * 0.28);
    ctx.shadowOffsetY = 2;
    for (const riga of righe) {
      ctx.fillText(riga, margine, y);
      y += interlinea;
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 4. CTA come pillola nel colore del brand
    if (cta) {
      y += Math.round(margine * 0.5);
      ctx.font = `700 ${dimCta}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      const larghezzaTesto = ctx.measureText(cta).width;
      const padX = Math.round(dimCta * 0.9);
      const padY = Math.round(dimCta * 0.55);
      const wPill = larghezzaTesto + padX * 2;
      const hPill = dimCta + padY * 2;
      const raggio = Math.round(hPill / 2);

      ctx.fillStyle = colore;
      ctx.beginPath();
      // roundRect non è supportato ovunque: path esplicito, funziona su tutti i browser
      ctx.moveTo(margine + raggio, y);
      ctx.lineTo(margine + wPill - raggio, y);
      ctx.arcTo(margine + wPill, y, margine + wPill, y + raggio, raggio);
      ctx.lineTo(margine + wPill, y + hPill - raggio);
      ctx.arcTo(margine + wPill, y + hPill, margine + wPill - raggio, y + hPill, raggio);
      ctx.lineTo(margine + raggio, y + hPill);
      ctx.arcTo(margine, y + hPill, margine, y + hPill - raggio, raggio);
      ctx.lineTo(margine, y + raggio);
      ctx.arcTo(margine, y, margine + raggio, y, raggio);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.fillText(cta, margine + padX, y + padY);
    }
  }

  // 5. Logo aziendale nell'angolo opposto al testo. Best-effort: un logo non
  // caricabile (CORS, URL rotto) non deve far fallire l'intero post.
  if (overlay.logoUrl) {
    try {
      const logo = await caricaImmagine(overlay.logoUrl);
      const larghezzaLogo = Math.round(target.w * 0.19);
      const altezzaLogo = Math.round((logo.naturalHeight / logo.naturalWidth) * larghezzaLogo);
      const lx = target.w - margine - larghezzaLogo;
      const ly = inAlto ? target.h - margine - altezzaLogo : margine;
      // Pastiglia bianca semitrasparente: i loghi scuri sparirebbero su foto scure
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      const pad = Math.round(larghezzaLogo * 0.08);
      ctx.fillRect(lx - pad, ly - pad, larghezzaLogo + pad * 2, altezzaLogo + pad * 2);
      ctx.drawImage(logo, lx, ly, larghezzaLogo, altezzaLogo);
    } catch {
      // logo assente: il post resta valido
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Composizione fallita"))), "image/png", 0.95);
  });

  return {
    blob,
    previewUrl: URL.createObjectURL(blob),
    width: target.w,
    height: target.h,
  };
}
