/**
 * Documenti della commessa: regole pure (cartelle, file ammessi, cartella
 * proposta dal nome del file). Nessun accesso al database qui.
 */

export interface CartellaDocumenti {
  id: string;
  company_id: string;
  nome: string;
  posizione: number;
  visibile_cliente: boolean;
  obbligatoria: boolean;
  archiviata_at: string | null;
}

/** 50 MB come il vecchio gestionale di Green Energy. */
export const MAX_MB_PER_FILE = 50;
export const MAX_BYTES_PER_FILE = MAX_MB_PER_FILE * 1024 * 1024;

/** Estensioni ammesse: documenti, immagini (anche iPhone), disegni, mail, archivi, firmati. */
export const ESTENSIONI_AMMESSE = [
  "pdf", "p7m",
  "doc", "docx", "odt", "rtf", "txt",
  "xls", "xlsx", "ods", "csv",
  "ppt", "pptx",
  "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "tif", "tiff", "bmp",
  "dwg", "dxf", "skp",
  "eml", "msg",
  "zip", "rar", "7z",
  "mp4", "mov",
];

export const ACCEPT_INPUT = ESTENSIONI_AMMESSE.map((e) => `.${e}`).join(",");

export function estensione(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i < 0 ? "" : nome.slice(i + 1).toLowerCase();
}

/** null = il file va bene; altrimenti il motivo da mostrare. */
export function problemaFile(file: { name: string; size: number }): string | null {
  if (!ESTENSIONI_AMMESSE.includes(estensione(file.name))) {
    return `«${file.name}»: formato non ammesso`;
  }
  if (file.size > MAX_BYTES_PER_FILE) {
    return `«${file.name}» supera ${MAX_MB_PER_FILE} MB`;
  }
  if (file.size === 0) return `«${file.name}» è vuoto`;
  return null;
}

/** Percorso nel bucket: la RLS dello storage riconosce il prefisso orders/<commessa>/. */
export function percorsoDocumento(orderId: string, nomeFile: string, ora = Date.now(), caso = Math.random()): string {
  const pulito = nomeFile.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9.-]/g, "_");
  return `orders/${orderId}/${ora}-${Math.floor(caso * 1e6)}-${pulito}`;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_\-.+]/g, " ").replace(/\s+/g, " ");

/**
 * Regole «parole nel nome del file» → «parole nel nome della cartella».
 * Valgono per qualunque azienda: si cerca la cartella il cui nome contiene
 * una delle parole indicate.
 */
const REGOLE: { file: RegExp; cartella: string[] }[] = [
  { file: /\b(gse|enel|tica|e distribuzione|connessione|regolamento di esercizio|iban gse)\b/, cartella: ["enel", "gse"] },
  { file: /\b(dico|di co|dichiarazione di conformita|conformita)\b/, cartella: ["dico"] },
  { file: /\b(visur\w*|catast\w*|mappal\w*|estratto di mappa)\b/, cartella: ["catast", "visur"] },
  { file: /\b(planimetri\w*|prospett\w*|sezion\w*|pianta|progett\w*|dwg|layout)\b/, cartella: ["architetton", "progett"] },
  { file: /\b(cila|scia|permesso di costruire|pratica edilizia|titolo edilizio|comune)\b/, cartella: ["pratica edilizia", "pratich"] },
  { file: /\b(asseverazion\w*)\b/, cartella: ["asseverazion"] },
  { file: /\b(fattur\w*|bonific\w*|ricevut\w*|pagament\w*|acconto|saldo|f24)\b/, cartella: ["fattur", "pagament"] },
  { file: /\b(preventiv\w*|offert\w*|quotazion\w*)\b/, cartella: ["preventiv"] },
  { file: /\b(contratt\w*|ordine firmato|proposta firmata|mandato)\b/, cartella: ["contratt"] },
  { file: /\b(carta identita|ci|cie|patente|passaporto|codice fiscale|tessera sanitaria|documento identita)\b/, cartella: ["doc cliente", "documenti cliente", "contratt"] },
  { file: /\b(bollett\w*|pod|pdr|isee|730|cud|unico|reddit\w*)\b/, cartella: ["bollett", "reddit", "doc cliente", "documenti cliente"] },
  { file: /\b(scheda tecnica|schede tecniche|datasheet|data sheet|manuale|certificat\w*)\b/, cartella: ["schede tecniche", "tecnic"] },
  { file: /\b(sopralluog\w*)\b/, cartella: ["sopralluog"] },
  { file: /\b(posizionament\w*|disposizione pannelli|stringhe)\b/, cartella: ["posizionament"] },
  { file: /\b(studio tecnico|relazione tecnica|calcol\w*)\b/, cartella: ["studio tecnico", "tecnic"] },
];

function cercaCartella(cartelle: CartellaDocumenti[], parole: string[]): CartellaDocumenti | undefined {
  for (const p of parole) {
    const trovata = cartelle.find((c) => norm(c.nome).includes(p));
    if (trovata) return trovata;
  }
  return undefined;
}

/**
 * Cartella proposta per un file. Ordine: regole sul nome, poi parole del nome
 * della cartella presenti nel nome del file, poi foto → cartella «foto»,
 * mail → «mail», infine la cartella predefinita (quella aperta) o nessuna.
 */
export function cartellaSuggerita(
  nomeFile: string,
  cartelle: CartellaDocumenti[],
  predefinita: string | null = null,
): string | null {
  const attive = cartelle.filter((c) => !c.archiviata_at);
  if (attive.length === 0) return null;
  const nome = ` ${norm(nomeFile.replace(/\.[^.]+$/, ""))} `;
  const ext = estensione(nomeFile);

  for (const r of REGOLE) {
    if (r.file.test(nome)) {
      const c = cercaCartella(attive, r.cartella);
      if (c) return c.id;
    }
  }

  // Una parola lunga del nome cartella dentro il nome del file ("sopralluogo_rossi.pdf").
  for (const c of attive) {
    const parole = norm(c.nome).split(/\s+/).filter((w) => w.length >= 6);
    if (parole.some((w) => nome.includes(w))) return c.id;
  }

  if (predefinita && attive.some((c) => c.id === predefinita)) return predefinita;

  if (["jpg", "jpeg", "png", "heic", "heif", "webp", "gif", "tif", "tiff", "bmp", "mp4", "mov"].includes(ext)) {
    const c = cercaCartella(attive, ["foto"]);
    if (c) return c.id;
  }
  if (["eml", "msg"].includes(ext)) {
    const c = cercaCartella(attive, ["mail", "comunicazion"]);
    if (c) return c.id;
  }
  if (ext === "dwg" || ext === "dxf") {
    const c = cercaCartella(attive, ["architetton", "progett", "tecnic"]);
    if (c) return c.id;
  }
  // Ultima spiaggia «Varie» (come fa il database per Silvio e il magazzino):
  // prima quella che inizia con «Varie», poi una che la contiene.
  const varie =
    attive.find((c) => norm(c.nome).startsWith("varie")) ?? attive.find((c) => norm(c.nome).includes("varie"));
  return varie?.id ?? null;
}

/** Cartelle obbligatorie ancora vuote per questa commessa. */
export function cartelleMancanti(
  cartelle: CartellaDocumenti[],
  documenti: { folder_id: string | null }[],
): CartellaDocumenti[] {
  const piene = new Set(documenti.map((d) => d.folder_id).filter(Boolean));
  return cartelle.filter((c) => c.obbligatoria && !c.archiviata_at && !piene.has(c.id));
}

/** Numero di documenti per cartella (chiave "" = senza cartella). */
export function contaPerCartella(documenti: { folder_id: string | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of documenti) {
    const k = d.folder_id ?? "";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Filtro ricerca: tutte le parole devono stare nel nome file o nella cartella. */
export function corrispondeRicerca(nomeFile: string, nomeCartella: string, testo: string): boolean {
  const parole = norm(testo).split(/\s+/).filter(Boolean);
  if (parole.length === 0) return true;
  const dove = `${norm(nomeFile)} ${norm(nomeCartella)}`;
  return parole.every((p) => dove.includes(p));
}

/** Cartella di un file in coda: quella scelta, o (se nessuna scelta) quella proposta dal nome. */
export function cartellaDelFileInCoda(
  pf: { file: { name: string }; folderId?: string | null },
  cartelle: CartellaDocumenti[],
): string | null {
  return pf.folderId !== undefined ? pf.folderId : cartellaSuggerita(pf.file.name, cartelle);
}

/** Cartella in cui mostrare i documenti personali del cliente dentro la commessa. */
export function cartellaDocumentiCliente(cartelle: CartellaDocumenti[]): string | null {
  const attive = cartelle.filter((c) => !c.archiviata_at);
  return (
    cercaCartella(attive, ["doc cliente", "documenti cliente", "contratt"])?.id ??
    cartellaSuggerita("documento", attive)
  );
}
