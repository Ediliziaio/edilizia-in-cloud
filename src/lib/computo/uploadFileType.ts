import type { ComputoUpload } from "@/types/computo";

const extensions: Record<string, ComputoUpload["file_type"]> = {
  pdf: "pdf", xlsx: "xlsx", xls: "xls", xpwe: "xpwe", dcf: "xpwe",
  xml: "xpwe", jpg: "image", jpeg: "image", png: "image",
};
const mimeTypes: Record<string, ComputoUpload["file_type"]> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "text/xml": "xpwe", "application/xml": "xpwe",
  "image/jpeg": "image", "image/png": "image",
};

export function computoFileType(file: Pick<File, "name" | "type">): ComputoUpload["file_type"] {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = extensions[extension] ?? mimeTypes[file.type.toLowerCase()];
  if (!type) throw new Error("Formato non supportato. Usa PDF, Excel, XPWE o immagini JPG/PNG.");
  return type;
}
