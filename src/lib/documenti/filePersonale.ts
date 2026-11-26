const MIME: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  heic: "image/heic", heif: "image/heif", gif: "image/gif", avif: "image/avif", bmp: "image/bmp",
  tif: "image/tiff", tiff: "image/tiff", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
export const DOCUMENTO_MAX_BYTES = 15 * 1024 * 1024;
export const ACCEPT_DOCUMENTO_PERSONALE = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.gif,.avif,.bmp,.tif,.tiff";

/** Conserva i byte e completa soltanto i metadati mancanti del selettore file. */
export function normalizzaMimeFile(file: File): File {
  const dichiarato = file.type.toLowerCase().split(";")[0];
  const estensione = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = !dichiarato || dichiarato === "application/octet-stream" ? MIME[estensione] : dichiarato;
  return mime && mime !== file.type ? new File([file], file.name, { type: mime, lastModified: file.lastModified }) : file;
}

/** I selettori di Android possono restituire PDF e foto con MIME vuoto o generico. */
export function preparaFilePersonale(file: File, consentiOffice = false): File {
  file = normalizzaMimeFile(file);
  if (!file.size) throw new Error("Il file è vuoto. Scegli un altro documento.");
  if (file.size > DOCUMENTO_MAX_BYTES) throw new Error("File troppo grande: massimo 15 MB.");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const dichiarato = file.type.toLowerCase().split(";")[0];
  const mime = !dichiarato || dichiarato === "application/octet-stream" ? MIME[ext] : dichiarato;
  const office = mime === MIME.doc || mime === MIME.docx;
  if (!mime || !Object.values(MIME).includes(mime) || (office && !consentiOffice)) {
    throw new Error(consentiOffice ? "Formato non consentito. Usa PDF, foto, DOC o DOCX." : "Formato non consentito. Usa un PDF o una foto.");
  }
  const nome = /\.[a-z0-9]{1,10}$/i.test(file.name) ? file.name : `${file.name || "documento"}.${Object.keys(MIME).find(k => MIME[k] === mime)}`;
  return mime === file.type && nome === file.name ? file : new File([file], nome, { type: mime, lastModified: file.lastModified });
}
