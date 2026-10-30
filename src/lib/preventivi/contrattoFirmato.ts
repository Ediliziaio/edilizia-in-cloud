/**
 * Il preventivo firmato è il contratto (29/10/2026). Si firma in quattro modi:
 * firma digitale col codice, accettazione dal link, su carta (l'ufficio carica
 * la scansione) o importato (il contratto arriva da «Carica contratto (AI)»
 * e la commessa nasce insieme). Regole pure: quando si può firmare su carta,
 * dove va la scansione, come si chiama il modo.
 */

export type FirmaModo = "digitale" | "online" | "carta" | "importato";

export interface ContrattoFirmato { bucket: string; path: string; name: string; mime?: string | null }

/** Si firma su carta solo un preventivo non ancora contratto, del preventivatore classico. */
export function puoFirmareSuCarta(status: string | null | undefined, source: string | null | undefined): boolean {
  if ((source ?? "").startsWith("modulo:")) return false;
  return ["bozza", "inviata", "scaduta"].includes(status ?? "");
}

const ESTENSIONI = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic"];
export const ACCETTA_SCANSIONE = ESTENSIONI.join(",");
export const MAX_SCANSIONE = 20 * 1024 * 1024;

export function scansioneValida(file: { name: string; size: number }): string | null {
  const ext = file.name.includes(".") ? `.${file.name.split(".").pop()!.toLowerCase()}` : "";
  if (!ESTENSIONI.includes(ext)) return "Carica un PDF o una foto (JPG, PNG, WEBP, HEIC).";
  if (file.size > MAX_SCANSIONE) return "Il file supera 20 MB: riducilo o scansiona a risoluzione più bassa.";
  if (file.size === 0) return "Il file è vuoto.";
  return null;
}

/**
 * Dove sta la scansione: `<azienda>/contratti-carta/<preventivo>/<istante>-<nome>`.
 * Il database accetta solo questa cartella, e lì un file non si sovrascrive né si cancella.
 */
export function percorsoContrattoCarta(companyId: string, quoteId: string, nomeOriginale: string, istante = Date.now()): string {
  // Solo il nome, senza cartelle né «..»: il file finisce sempre nella cartella del preventivo.
  const nomeFile = (nomeOriginale.split(/[\\/]/).pop() ?? "").replace(/\.{2,}/g, ".");
  const ext = nomeFile.includes(".") ? `.${nomeFile.split(".").pop()!.toLowerCase()}` : "";
  const base = nomeFile.replace(/\.[^.]+$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "contratto";
  return `${companyId}/contratti-carta/${quoteId}/${istante}-${base}${ext}`;
}

export const ETICHETTA_FIRMA: Record<FirmaModo, string> = {
  digitale: "Firmato digitalmente",
  online: "Accettato online",
  carta: "Firmato su carta",
  importato: "Contratto importato",
};

/** Il modo della firma: scritto sul preventivo, o dedotto per quelli firmati prima del 29/10/2026. */
export function modoFirma(q: { firma_modo?: string | null; signed_at?: string | null; signed_by_ip?: string | null }): FirmaModo | null {
  if (q.firma_modo && q.firma_modo in ETICHETTA_FIRMA) return q.firma_modo as FirmaModo;
  if (!q.signed_at) return null;
  return q.signed_by_ip ? "online" : null;
}

/** Il documento firmato registrato sul preventivo, se è leggibile. */
export function documentoFirmato(v: unknown): ContrattoFirmato | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  if (typeof d.bucket !== "string" || typeof d.path !== "string" || !d.path || d.path.includes("..")) return null;
  if (!["quote-pdfs", "order-attachments"].includes(d.bucket)) return null;
  return { bucket: d.bucket, path: d.path, name: typeof d.name === "string" && d.name ? d.name : "contratto firmato", mime: typeof d.mime === "string" ? d.mime : null };
}
