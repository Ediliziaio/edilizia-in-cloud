import { supabase } from "@/integrations/supabase/client";
import { controllaImmagineCatalogo, MAX_IMMAGINI_CATALOGO, RUOLI_IMMAGINE, type BozzaImmagineCatalogo, type ImmagineCatalogo } from "./immaginiCatalogo";

/** New immutable paths: an edit never overwrites assets used by an older quote. */
export async function caricaImmaginiCatalogo(companyId: string, ownerId: string, bozze: readonly BozzaImmagineCatalogo[]) {
  if (!companyId || !ownerId || /[\/]/.test(companyId + ownerId)) throw new Error("Azienda o linea non valida");
  if (bozze.length > MAX_IMMAGINI_CATALOGO) throw new Error(`Al massimo ${MAX_IMMAGINI_CATALOGO} immagini per linea.`);
  if (new Set(bozze.map(i => i.id)).size !== bozze.length || bozze.filter(i => i.ruolo === "principale").length > 1)
    throw new Error("La galleria contiene immagini duplicate o più immagini principali.");
  for (const b of bozze) {
    if (!b.id || b.id.length > 100 || !Object.prototype.hasOwnProperty.call(RUOLI_IMMAGINE, b.ruolo))
      throw new Error("Identificativo o ruolo dell'immagine non valido.");
    const error = b.file ? controllaImmagineCatalogo(b.file) : null;
    if (error) throw new Error(error);
    if (b.didascalia.length > 240) throw new Error("La didascalia può contenere al massimo 240 caratteri.");
    if (!b.file && !/^(https?:\/\/|\/(?!\/))/.test(b.url)) throw new Error("Indirizzo immagine non valido. Seleziona nuovamente il file.");
  }
  const caricati: string[] = [];
  const annulla = async () => {
    if (caricati.length) await supabase.storage.from("article-images").remove(caricati).catch((): void => undefined);
  };
  try {
    const immagini: ImmagineCatalogo[] = [];
    for (const b of bozze) {
      let url = b.url;
      if (b.file) {
        const ext = b.file.type === "image/png" ? "png" : b.file.type === "image/webp" ? "webp" : "jpg";
        const path = `${companyId}/linee/${ownerId}-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("article-images").upload(path, b.file, { upsert: false, contentType: b.file.type, cacheControl: "3600" });
        if (error) throw new Error(`Immagine non caricata: ${error.message}`);
        caricati.push(path);
        url = supabase.storage.from("article-images").getPublicUrl(path).data.publicUrl;
      }
      immagini.push({ id: b.id, url, ruolo: b.ruolo, didascalia: b.didascalia.trim() });
    }
    return { immagini, annulla };
  } catch (err) { await annulla(); throw err; }
}

export function erroreGalleria(err: { code?: string; message?: string }): Error {
  return new Error(["42703", "PGRST204"].includes(err.code ?? "") && /immagini/i.test(err.message ?? "")
    ? "La galleria richiede l'aggiornamento del database. Nessuna immagine è stata salvata parzialmente."
    : err.message || "Galleria non salvata");
}
