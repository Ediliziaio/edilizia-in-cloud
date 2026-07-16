// F3 (audit render 16/07) — Compressione client-side della foto sorgente.
//
// Perché: le foto da smartphone pesano 8-20MB; venivano caricate INTERE sul
// bucket (upload lento su 4G di cantiere, storage sprecato) e il resize
// avveniva solo server-side a 1600px. Comprimiamo PRIMA dell'upload:
// lato lungo max 1600px (stesso target del transform server) + JPEG q0.85.
// Tipico: 12MB → 400-800KB, upload 10-20× più veloce.
//
// Gestione HEIC/HEIF (iPhone): il canvas può codificare solo ciò che il
// browser sa DECODIFICARE. Safari decodifica HEIC nativamente → esce JPEG
// e il problema sparisce. Chrome/Firefox no → decode fallisce → errore
// CHIARO all'utente prima dell'upload (prima falliva l'intera catena AI
// a credito già scalato-e-rimborsato).

export interface CompressedRenderPhoto {
  file: File;
  meta: {
    width: number;
    height: number;
    orientation: "landscape" | "portrait" | "square";
  };
  /** true se abbiamo riconvertito/compresso, false se l'originale era già ok. */
  compressed: boolean;
}

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;
/** Sotto questa soglia e già entro MAX_SIDE non ricomprimiamo (evita doppia
 *  perdita JPEG su foto già leggere). */
const SKIP_BYTES = 2_500_000;

const CANVAS_SAFE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function decodeImage(file: File): Promise<HTMLImageElement | ImageBitmap> {
  // createImageBitmap è più veloce e non tocca il DOM; fallback a <img>
  // per i browser che non lo supportano su tutti i mime.
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).catch(() => decodeViaImg(file));
  }
  return decodeViaImg(file);
}

function decodeViaImg(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode_failed"));
    };
    img.src = url;
  });
}

function orientationOf(width: number, height: number): CompressedRenderPhoto["meta"]["orientation"] {
  return width === height ? "square" : width > height ? "landscape" : "portrait";
}

/**
 * Comprime/normalizza la foto per il render. Lancia Error con messaggio
 * user-friendly in italiano se il browser non sa decodificare il formato
 * (tipicamente HEIC su Chrome/Windows).
 */
export async function compressRenderPhoto(file: File): Promise<CompressedRenderPhoto> {
  let source: HTMLImageElement | ImageBitmap;
  try {
    source = await decodeImage(file);
  } catch {
    const looksHeic = /\.hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type);
    throw new Error(
      looksHeic
        ? "Questo browser non legge le foto HEIC di iPhone. Scatta direttamente dalla fotocamera qui nell'app, oppure esporta la foto come JPG e ricaricala."
        : "Formato immagine non leggibile dal browser. Usa una foto JPG o PNG.",
    );
  }

  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height = "naturalHeight" in source ? source.naturalHeight : source.height;
  const maxSide = Math.max(width, height);

  // Già leggera, entro dimensioni e in un formato che i provider accettano:
  // non tocchiamo nulla.
  if (maxSide <= MAX_SIDE && file.size <= SKIP_BYTES && CANVAS_SAFE_TYPES.has(file.type)) {
    if ("close" in source) source.close();
    return {
      file,
      meta: { width, height, orientation: orientationOf(width, height) },
      compressed: false,
    };
  }

  const scale = Math.min(1, MAX_SIDE / maxSide);
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if ("close" in source) source.close();
    // Canvas non disponibile (molto raro): meglio l'originale che niente.
    return {
      file,
      meta: { width, height, orientation: orientationOf(width, height) },
      compressed: false,
    };
  }
  ctx.drawImage(source, 0, 0, outW, outH);
  if ("close" in source) source.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob) {
    return {
      file,
      meta: { width, height, orientation: orientationOf(width, height) },
      compressed: false,
    };
  }

  const outName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return {
    file: new File([blob], outName, { type: "image/jpeg" }),
    meta: { width: outW, height: outH, orientation: orientationOf(outW, outH) },
    compressed: true,
  };
}
