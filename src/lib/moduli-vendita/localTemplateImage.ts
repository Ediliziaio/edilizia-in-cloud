import { compressImage } from "@/lib/campo/compressImage";

/** Lato più lungo delle foto dei modelli: nitide su una pagina A4 del PDF, leggere da salvare. */
const LATO_MASSIMO = 1600;
const QUALITA = 0.8;
/** Una foto dal telefono si accetta e si riduce; oltre, meglio sceglierne un'altra. */
const MASSIMO_IN_ENTRATA = 15 * 1024 * 1024;
/** Un PNG piccolo (un logo, con la trasparenza) resta com'è. */
const PNG_INTATTO = 1024 * 1024;

const comeDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Immagine non leggibile."));
  reader.onerror = () => reject(new Error("Immagine non leggibile."));
  reader.readAsDataURL(blob);
});

/**
 * L'immagine di un modello, pronta da salvare nel modello stesso. Le foto si riducono
 * (lato massimo 1600 px, JPEG): da 3-5 MB diventano poche centinaia di kB, e il modello
 * resta leggero da salvare e da aprire. I PNG piccoli (loghi) restano intatti per la
 * trasparenza. Local drafts must never upload to the company's live storage.
 */
export async function readLocalTemplateImage(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Usa un'immagine PNG, JPG o WEBP.");
  if (file.size > MASSIMO_IN_ENTRATA) throw new Error("Immagine troppo grande: usa una foto sotto i 15 MB.");
  if (file.type === "image/png" && file.size <= PNG_INTATTO) return comeDataUrl(file);
  try {
    const ridotta = await compressImage(file, LATO_MASSIMO, QUALITA);
    return comeDataUrl(ridotta.size < file.size ? ridotta : file);
  } catch {
    // Il browser non è riuscito a ridurla: va bene com'è solo se è già leggera.
    if (file.size <= PNG_INTATTO) return comeDataUrl(file);
    throw new Error("Non riesco a ridurre questa immagine: usane una sotto 1 MB.");
  }
}
