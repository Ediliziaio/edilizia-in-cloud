/**
 * La copia firmata su carta, fotografata col telefono (06/11/2026).
 *
 * Florin: «una variante può essere firmata anche cartacea e io carico il contratto lì in formato
 * cartaceo». Chi firma su carta la fotografa, e viene fuori un JPG: il server accetta solo PDF veri
 * (controlla «%PDF-» e lo apre con pdf-lib). Qui la foto diventa una pagina PDF prima di partire,
 * così si carica quello che si ha in mano senza convertirlo a parte.
 *
 * Una pagina per foto, orientata come lo scatto, rimpicciolita se è più grande di un A4: le foto da
 * 12 megapixel pesano più del tetto di 10 MB.
 */

/** Il lato lungo massimo in punti PDF: un A4 è 595 × 842. Oltre, si rimpicciolisce. */
const LATO_MAX = 1600;
/** Oltre questa qualità il file cresce senza che la firma si legga meglio. */
const QUALITA = 0.82;

export const eUnaFoto = (file: File): boolean =>
  file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);

/** Il nome del file caricato: il server vuole che finisca in .pdf. */
export function nomePdfDellaFoto(nome: string): string {
  const pulito = nome.replace(/\.[^.]+$/, "").trim() || "copia-firmata";
  return `${pulito}.pdf`;
}

/** Quanto diventa grande la pagina, mantenendo le proporzioni dello scatto. */
export function misuraPagina(larghezza: number, altezza: number, latoMax = LATO_MAX): { w: number; h: number } {
  const lato = Math.max(larghezza, altezza);
  const scala = lato > latoMax ? latoMax / lato : 1;
  return { w: Math.max(1, Math.round(larghezza * scala)), h: Math.max(1, Math.round(altezza * scala)) };
}

async function immagineDaFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((risolvi, rifiuta) => {
      const img = new Image();
      img.onload = () => risolvi(img);
      img.onerror = () => rifiuta(new Error("La foto non si apre: riprova con un'altra immagine o un PDF."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Da una foto a un PDF di una pagina. Restituisce i byte in base64, come li vuole il server.
 * Se il file è già un PDF non si tocca: lo deve leggere chi chiama, prima di passare di qui.
 */
export async function fotoInPdfBase64(file: File): Promise<string> {
  const img = await immagineDaFile(file);
  const { w, h } = misuraPagina(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Non riesco a preparare la foto: caricala come PDF.");
  // Fondo bianco: un PNG con trasparenza diventerebbe nero nel PDF.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const dati = canvas.toDataURL("image/jpeg", QUALITA);

  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: w >= h ? "landscape" : "portrait", unit: "pt", format: [w, h] });
  pdf.addImage(dati, "JPEG", 0, 0, w, h);
  const base64 = pdf.output("datauristring").split(",")[1] ?? "";
  if (!base64) throw new Error("Non riesco a preparare la foto: caricala come PDF.");
  return base64;
}
