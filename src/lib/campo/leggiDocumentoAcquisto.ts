import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "./compressImage";
import { mappaLetturaDocumento, type LetturaDocumento } from "./acquisti";

const BUCKET = "campo-rapportini";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("lettura file"));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

export interface FotoDocumento {
  /** Percorso nel deposito, da salvare con l'acquisto. Null se il caricamento non è riuscito. */
  path: string | null;
  anteprima: string;
  /** Null se la lettura automatica non è riuscita: si compila a mano. */
  lettura: LetturaDocumento | null;
}

/**
 * Foto del documento → caricata e letta (in parallelo). Nessuna delle due cose blocca l'altra:
 * se la lettura fallisce l'operaio scrive fornitore e totale; se il caricamento fallisce la foto
 * non si allega e lo si dice.
 */
export async function elaboraFotoDocumento(file: File, companyId: string, orderId: string | null): Promise<FotoDocumento> {
  if (!file.type.startsWith("image/")) throw new Error("Scegli una foto del documento (non un PDF o un altro file).");
  if (!file.size || file.size > 15 * 1024 * 1024) throw new Error("La foto è vuota o supera 15 MB: scegli una foto più piccola.");
  if (!companyId) throw new Error("Sessione scaduta: accedi di nuovo.");
  // I documenti hanno testo piccolo: più risoluzione delle foto di cantiere.
  const blob: Blob = await compressImage(file, 1800, 0.8).catch((): Blob => file);
  const mime = blob.type || file.type;
  const estensioni: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const estensione = estensioni[mime];
  if (!estensione) throw new Error("Questa foto non è leggibile: scegli un'immagine JPG, PNG o WebP.");
  const anteprima = URL.createObjectURL(blob);
  const cartella = orderId ?? "generico";
  const percorso = `${companyId}/${cartella}/acquisti/${crypto.randomUUID()}.${estensione}`;

  const caricamento = supabase.storage.from(BUCKET)
    .upload(percorso, blob, { contentType: mime, upsert: false })
    .then(({ data, error }): string | null => (error || !data?.path ? null : data.path))
    .catch((): string | null => null);

  const lettura = blobToBase64(blob)
    .then(async (image_base64): Promise<LetturaDocumento | null> => {
      const { data, error } = await supabase.functions.invoke("ddt-ai-extract", {
        body: { image_base64, mime_type: mime, file_name: `documento.${estensione}`, company_id: companyId },
      });
      if (error || !data?.success) return null;
      return mappaLetturaDocumento(data.ddt);
    })
    .catch((): LetturaDocumento | null => null);

  const [path, letto] = await Promise.all([caricamento, lettura]);
  return { path, anteprima, lettura: letto };
}
