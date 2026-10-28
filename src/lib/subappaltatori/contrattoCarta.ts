export const BUCKET_CONTRATTI_CARTA = "contratti-sub-carta";
export const MAX_CONTRATTO_CARTA = 20 * 1024 * 1024;
export async function validaScansioneContratto(file: File) {
  if (!file.size || file.size > MAX_CONTRATTO_CARTA)
    throw Error("Scegli un file non vuoto, fino a 20 MB.");
  const b = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  if (new TextDecoder().decode(b).includes("%PDF-")) return "application/pdf";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v))
    return "image/png";
  throw Error("Formato non supportato. Carica una scansione PDF, JPG o PNG.");
}
