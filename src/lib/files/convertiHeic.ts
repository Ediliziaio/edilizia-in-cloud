let conversione = Promise.resolve();
/** Il decoder lavora in sequenza: più foto iPhone non devono esaurire la memoria insieme. */
export async function convertiHeic(file: File): Promise<File> {
  let sblocca!: () => void;
  const precedente = conversione;
  conversione = new Promise<void>((r) => {
    sblocca = r;
  });
  await precedente;
  try {
    const url = `${import.meta.env.BASE_URL}vendor/heic-to-1.6.7/worker.js`;
    const worker = new Worker(url, { type: "module" });
    const blob = await new Promise<Blob>((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error("Conversione scaduta"));
      }, 30000);
      worker.onmessage = (e: MessageEvent<{ blob?: Blob; error?: string }>) => {
        clearTimeout(timer);
        worker.terminate();
        if (e.data.blob) resolve(e.data.blob);
        else reject(new Error(e.data.error || "Conversione non riuscita"));
      };
      worker.onerror = () => {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error("Conversione non disponibile"));
      };
      worker.postMessage(file);
    });
    if (!blob?.size || blob.type !== "image/jpeg")
      throw new Error("Conversione HEIC non riuscita");
    return new File([blob], file.name.replace(/\.hei[cf]$/i, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    throw new Error(
      "Non riesco a convertire questa foto HEIC. L’originale è conservato: riprova o scegli una foto JPG.",
    );
  } finally {
    sblocca();
  }
}
