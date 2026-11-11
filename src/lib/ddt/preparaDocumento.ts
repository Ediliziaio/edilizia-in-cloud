import { convertiHeic } from "@/lib/files/convertiHeic";

/** Un solo contratto per fotografie e PDF. L'originale non viene modificato. */
export const ACCEPT_DOCUMENTI_DDT =
  ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.bmp";
export const MAX_DOCUMENTO_BYTE = 18 * 1024 * 1024;
const MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  bmp: "image/bmp",
};
export function mimeDocumento(file: Pick<File, "name" | "type">): string {
  const estensione = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME[estensione] ?? file.type.toLowerCase();
}
export function erroreDocumento(
  file: Pick<File, "name" | "type" | "size">,
): string | null {
  if (!Object.values(MIME).includes(mimeDocumento(file)))
    return "Formato non supportato: scegli PDF, JPG, PNG, WebP, HEIC o HEIF.";
  if (!file.size) return "Il documento è vuoto.";
  if (file.size > MAX_DOCUMENTO_BYTE)
    return "Il singolo documento supera 18 MB: dividi prima il PDF o scegli una foto più piccola.";
  return null;
}
export async function preparaDocumento(
  file: File,
): Promise<{ originale: File; lettura: File }> {
  const errore = erroreDocumento(file);
  if (errore) throw new Error(errore);
  const mime = mimeDocumento(file);
  const lettura = /image\/hei[cf]/.test(mime)
    ? await convertiHeic(file)
    : file.type === mime
      ? file
      : new File([file], file.name, {
          type: mime,
          lastModified: file.lastModified,
        });
  if (lettura.size > MAX_DOCUMENTO_BYTE)
    throw new Error(
      "La conversione supera 18 MB: scegli una foto più piccola.",
    );
  return { originale: file, lettura };
}
export async function improntaDocumenti(files: Blob[]): Promise<string> {
  const hashes: string[] = [];
  for (const f of files) {
    const digest = await crypto.subtle.digest("SHA-256", await f.arrayBuffer());
    hashes.push(
      Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );
  }
  const insieme = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(hashes.join(":")),
  );
  return Array.from(new Uint8Array(insieme))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
