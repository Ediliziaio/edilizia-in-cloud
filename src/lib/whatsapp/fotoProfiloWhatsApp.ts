/**
 * La foto del profilo WhatsApp, pronta per Meta: WhatsApp la mostra rotonda
 * dentro un quadrato, quindi si ritaglia al centro un quadrato e lo si porta a
 * 640×640 in JPG. Così va bene qualunque foto scelta dal telefono o dal
 * computer, anche rettangolare o molto pesante, e a Meta arriva un file piccolo.
 */
import { FOTO_PROFILO } from "../../../supabase/functions/_shared/profiloWhatsApp";

export interface FotoProfiloPronta {
  /** Il JPG in base64, senza il prefisso «data:». */
  base64: string;
  tipo: "image/jpeg";
  /** Per l'anteprima nella finestra (data URL). */
  anteprima: string;
}

/** Oltre questa misura non si prova nemmeno ad aprirla nel browser. */
const MAX_BYTE_ORIGINALE = 25 * 1024 * 1024;

function caricaImmagine(file: File): Promise<HTMLImageElement> {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      ko(new Error("Non riesco ad aprire questa foto: prova con un JPG o un PNG."));
    };
    img.src = url;
  });
}

export async function preparaFotoProfilo(file: File): Promise<FotoProfiloPronta> {
  if (!(FOTO_PROFILO.tipiAmmessi as readonly string[]).includes(file.type)) {
    throw new Error("Scegli una foto JPG o PNG.");
  }
  if (file.size > MAX_BYTE_ORIGINALE) {
    throw new Error("La foto è troppo pesante: scegline una sotto i 25 MB.");
  }
  const img = await caricaImmagine(file);
  const lato = Math.min(img.naturalWidth, img.naturalHeight);
  if (!lato) throw new Error("Non riesco ad aprire questa foto: prova con un JPG o un PNG.");

  const canvas = document.createElement("canvas");
  canvas.width = FOTO_PROFILO.lato;
  canvas.height = FOTO_PROFILO.lato;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Il browser non riesce a preparare la foto.");
  // Fondo bianco: un PNG trasparente in JPG diventerebbe nero.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, FOTO_PROFILO.lato, FOTO_PROFILO.lato);
  ctx.drawImage(
    img,
    (img.naturalWidth - lato) / 2,
    (img.naturalHeight - lato) / 2,
    lato,
    lato,
    0,
    0,
    FOTO_PROFILO.lato,
    FOTO_PROFILO.lato,
  );
  const anteprima = canvas.toDataURL("image/jpeg", 0.9);
  return { base64: anteprima.slice(anteprima.indexOf(",") + 1), tipo: "image/jpeg", anteprima };
}
