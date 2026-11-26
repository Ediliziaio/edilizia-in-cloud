import { Directory, Filesystem } from "@capacitor/filesystem";

const cartelle = new Set<string>();
let generazione = 0;
const ESTENSIONI: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/heic": "heic", "image/heif": "heif", "text/plain": "txt", "text/csv": "csv",
  "image/gif": "gif", "image/avif": "avif", "image/bmp": "bmp", "image/tiff": "tif",
  "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

/** I file aperti in questa sessione non restano disponibili dopo uscita o cambio utente. */
export async function svuotaCacheDocumenti(): Promise<void> {
  generazione++;
  const daTogliere = [...cartelle];
  cartelle.clear();
  await Promise.all(daTogliere.map(path => Filesystem.rmdir({ path, directory: Directory.Cache, recursive: true }).catch(() => {})));
}

/** File privato e nome originale, in una cartella diversa per ogni apertura. */
export async function fileInCache(blob: Blob, nome: string): Promise<string> {
  const sessione = generazione;
  let sicuro = (nome.split(/[\\/]/).pop() || "documento").replace(/[\p{Cc}:*?"<>|]/gu, "_").slice(-150);
  if (!/\.[a-z0-9]{1,10}$/i.test(sicuro)) sicuro += `.${ESTENSIONI[blob.type.split(";")[0]] ?? "bin"}`;
  const cartella = `documenti-temporanei/${crypto.randomUUID()}`;
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Impossibile leggere il documento."));
    reader.onabort = () => reject(new Error("Lettura del documento interrotta."));
    reader.readAsDataURL(blob);
  });
  if (sessione !== generazione) throw new Error("Sessione cambiata. Riapri il documento.");
  cartelle.add(cartella);
  const { uri } = await Filesystem.writeFile({ path: `${cartella}/${sicuro}`, data, directory: Directory.Cache, recursive: true });
  if (sessione !== generazione) {
    await Filesystem.rmdir({ path: cartella, directory: Directory.Cache, recursive: true }).catch(() => {});
    throw new Error("Sessione cambiata. Riapri il documento.");
  }
  return uri;
}
