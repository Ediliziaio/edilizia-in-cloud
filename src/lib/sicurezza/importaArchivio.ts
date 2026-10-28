import type { DocumentoSubappaltatore } from "@/types/subappaltatori";
export interface DestinazioneArchivio {
  companyId: string;
  subId: string;
  orderId: string | null;
  titolo: string;
}
export function tipoArchivioFascicolo(tipo: string): string {
  return ({
    durc: "durc",
    visura_camerale: "visura",
    dvr: "dvr",
    pos: "pos",
    attestazione_soa: "qualificazione",
    iso_certificazione: "qualificazione",
  } as Record<string, string>)[tipo] || "altro";
}
export function controllaArchivio(
  d: DocumentoSubappaltatore,
  t: DestinazioneArchivio,
) {
  if (d.company_id !== t.companyId || d.subappaltatore_id !== t.subId) {
    throw Error("Il documento non appartiene a questa impresa.");
  }
  const parti = d.url.split("/");
  if (
    parti.length !== 3 || parti[0] !== t.companyId || parti[1] !== t.subId ||
    parti.some((p) => !p || p === "." || p === "..") || d.url.includes("\\") ||
    /%|[?#]/.test(d.url)
  ) {
    throw Error(
      "Originale non gestito nell’archivio privato: caricalo manualmente nel fascicolo.",
    );
  }
  if (!t.titolo.trim()) throw Error("Indica il titolo del documento.");
  if (d.tipo === "pos" && !t.orderId) {
    throw Error("Il POS richiede la commessa corretta.");
  }
}
export async function fileArchivio(blob: Blob, nome: string) {
  if (!blob.size || blob.size > 15 * 1024 * 1024) {
    throw Error("Originale vuoto o superiore a 15 MB.");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const ascii = (da: number, a: number) =>
    new TextDecoder().decode(bytes.subarray(da, a));
  const mime = ascii(0, 5) === "%PDF-"
    ? "application/pdf"
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    ? "image/jpeg"
    : bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
    ? "image/png"
    : ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP"
    ? "image/webp"
    : null;
  if (!mime) {
    throw Error(
      "Il nuovo fascicolo accetta PDF o immagini; questo originale richiede una conversione esplicita.",
    );
  }
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  ).map((x) => x.toString(16).padStart(2, "0")).join("");
  return {
    blob: new Blob([bytes], { type: mime }),
    sha256,
    nome: nome || "documento",
    bytes: bytes.length,
  };
}
export const marcatoreArchivio = (id: string) =>
  `[Importazione archivio precedente: ${id}]`;
export function notaArchivio(d: DocumentoSubappaltatore, hash: string) {
  return `${marcatoreArchivio(d.id)}\nOriginale ${
    d.nome_file || "documento"
  }; SHA-256 ${hash}.\nCopia per consultazione: classificazione e validità da verificare. Nessun esito precedente ereditato.${
    d.note ? "\nNote dell’archivio: " + d.note : ""
  }`;
}
export function stessaFonteArchivio(
  a: DocumentoSubappaltatore,
  b: DocumentoSubappaltatore,
) {
  return [
    "id",
    "company_id",
    "subappaltatore_id",
    "url",
    "tipo",
    "nome_file",
    "data_rilascio",
    "data_scadenza",
    "note",
  ].every((k) =>
    a[k as keyof DocumentoSubappaltatore] ===
      b[k as keyof DocumentoSubappaltatore]
  );
}
