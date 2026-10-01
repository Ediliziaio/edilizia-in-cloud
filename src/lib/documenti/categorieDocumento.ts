/**
 * Documenti di un contatto/opportunità: categorie, controllo dei file e
 * anteprima.
 *
 * L'elenco era piatto — nome e dimensione, niente di più — e per sapere cosa
 * fosse un file bisognava scaricarlo. Qui la parte senza interfaccia: le
 * categorie, quella suggerita dal nome del file, i limiti di caricamento e quali
 * file si possono vedere in anteprima.
 */

export const CATEGORIE_DOCUMENTO = [
  { chiave: "contratto", etichetta: "Contratto" },
  { chiave: "preventivo", etichetta: "Preventivo / offerta" },
  { chiave: "planimetria", etichetta: "Planimetria / progetto" },
  { chiave: "foto", etichetta: "Foto" },
  { chiave: "identita", etichetta: "Documento d'identità" },
  { chiave: "fattura", etichetta: "Fattura / pagamento" },
  { chiave: "ufficiale", etichetta: "Visura / documento ufficiale" },
  { chiave: "altro", etichetta: "Altro" },
] as const;

export type CategoriaDocumento = (typeof CATEGORIE_DOCUMENTO)[number]["chiave"];

export function etichettaCategoria(chiave: string | null | undefined): string {
  return CATEGORIE_DOCUMENTO.find((c) => c.chiave === chiave)?.etichetta ?? "Altro";
}

/** Una categoria a partire dal nome del file e dal tipo, così si parte già giusti. */
export function categoriaSuggerita(nomeFile: string | null | undefined, tipo?: string | null): CategoriaDocumento {
  const n = (nomeFile ?? "").toLowerCase();
  if (/contratt|accordo|incarico|mandato/.test(n)) return "contratto";
  if (/preventiv|offerta|computo|capitolato/.test(n)) return "preventivo";
  if (/planimetri|progett|tavola|dwg|render|layout/.test(n)) return "planimetria";
  if (/fattur|ricevut|bonifico|pagament|acconto|saldo/.test(n)) return "fattura";
  if (/identit|carta[_ -]?id|patente|passaporto|codice[_ -]?fiscale|tessera/.test(n)) return "identita";
  if (/visura|camerale|durc|catast/.test(n)) return "ufficiale";
  if ((tipo ?? "").startsWith("image/")) return "foto";
  return "altro";
}

export const ESTENSIONI_AMMESSE = ["pdf", "png", "jpg", "jpeg", "gif", "doc", "docx", "xls", "xlsx", "csv", "txt"];
export const LIMITE_MB = 20;

/** Il motivo per cui un file non va caricato, o null se va bene. */
export function erroreFile(file: { name: string; size: number }): string | null {
  const est = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!ESTENSIONI_AMMESSE.includes(est)) {
    return `«${file.name}»: formato non ammesso (si caricano ${ESTENSIONI_AMMESSE.join(", ")})`;
  }
  if (file.size > LIMITE_MB * 1024 * 1024) {
    return `«${file.name}»: supera ${LIMITE_MB} MB`;
  }
  if (file.size === 0) return `«${file.name}»: il file è vuoto`;
  return null;
}

/** Anteprima nella scheda per PDF e immagini. */
export function tipoAnteprima(tipo: string | null | undefined, nome?: string | null): "immagine" | "pdf" | null {
  const t = (tipo ?? "").toLowerCase();
  const n = (nome ?? "").toLowerCase();
  if (t.startsWith("image/") || /\.(png|jpe?g|gif)$/.test(n)) return "immagine";
  if (t.includes("pdf") || n.endsWith(".pdf")) return "pdf";
  return null;
}

/** Cambia il nome tenendo l'estensione originale se chi scrive l'ha dimenticata. */
export function nomeRinominato(originale: string, nuovo: string): string {
  const pulito = nuovo.trim().replace(/[\\/]/g, "-");
  if (!pulito) return originale;
  const estOrig = originale.includes(".") ? originale.split(".").pop()! : "";
  const estNuova = pulito.includes(".") ? pulito.split(".").pop()! : "";
  return estOrig && !estNuova ? `${pulito}.${estOrig}` : pulito;
}

export function formatDimensione(bytes: number | null | undefined): string {
  const b = Number(bytes ?? 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
