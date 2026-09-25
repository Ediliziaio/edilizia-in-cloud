/** Local drafts must never upload to the company's live storage. */
export function readLocalTemplateImage(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return Promise.reject(new Error("Usa un'immagine PNG, JPG o WEBP."));
  if (file.size > 1024 * 1024) return Promise.reject(new Error("Per i modelli usa immagini inferiori a 1 MB."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Immagine non leggibile."));
    reader.onerror = () => reject(new Error("Immagine non leggibile."));
    reader.readAsDataURL(file);
  });
}
