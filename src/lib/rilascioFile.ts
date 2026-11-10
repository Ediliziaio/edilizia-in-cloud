/**
 * Regole del trascinamento dei file: cosa si può rilasciare e dove.
 *
 * Nessun caricamento va collegato a mano: ogni `<input type="file">` a schermo
 * diventa da solo un'area di rilascio, e il file entra nello stesso campo che
 * userebbe il pulsante (vedi `RilascioFileGlobale`). Tre segnali, solo dove
 * servono:
 * - `data-zona-rilascio` su un contenitore: l'area è quello (la chat intera,
 *   non solo la barra del messaggio);
 * - `data-rilascio="no"` sull'input: questo campo non si riempie trascinando;
 * - `data-rilascio="senza-filtro"` sull'input: il controllo del formato lo fa
 *   già chi riceve il file, con un suo messaggio.
 */

export const ATTR_ZONA = "data-zona-rilascio";

const CONFINI =
  'form,section,article,main,[role="dialog"],[role="alertdialog"],[role="tabpanel"],[data-ui="card"]';
const DIALOGHI = '[role="dialog"],[role="alertdialog"]';

/** Estensioni dei tipi più comuni: alcuni file arrivano senza tipo, o con quello sbagliato. */
const ESTENSIONI: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
  "image/gif": ["gif"],
  "image/svg+xml": ["svg"],
  "text/csv": ["csv"],
  "text/plain": ["txt"],
  "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/zip": ["zip"],
  "application/json": ["json"],
  "image/*": ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "bmp", "tif", "tiff", "svg"],
};

const NOMI: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WebP",
  "image/gif": "GIF",
  "image/svg+xml": "SVG",
  "text/csv": "CSV",
  "text/plain": "TXT",
  "application/vnd.ms-excel": "Excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/msword": "Word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/zip": "ZIP",
  "application/json": "JSON",
  "image/*": "immagini",
  "audio/*": "audio",
  "video/*": "video",
  "text/*": "testo",
  ".jpeg": "JPG",
  ".xls": "Excel",
  ".xlsx": "Excel",
  ".xlsm": "Excel",
  ".doc": "Word",
  ".docx": "Word",
  ".txt": "TXT",
};

function vociAccept(accept: string): string[] {
  return accept.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
}

/** La stessa regola che il selettore di file applica con l'attributo `accept`. */
export function formatoAmmesso(file: { name: string; type: string }, accept: string): boolean {
  const voci = vociAccept(accept);
  if (voci.length === 0) return true;
  const nome = file.name.toLowerCase();
  const tipo = (file.type || "").toLowerCase();
  const perEstensione = (voce: string) => (ESTENSIONI[voce] ?? []).some((e) => nome.endsWith(`.${e}`));
  return voci.some((voce) => {
    if (voce.startsWith(".")) return nome.endsWith(voce);
    if (voce.endsWith("/*")) return tipo ? tipo.startsWith(voce.slice(0, -1)) : perEstensione(voce);
    return tipo === voce || perEstensione(voce);
  });
}

/** «PDF, PNG, JPG»: i formati di un `accept`, come li direbbe una persona. */
export function descriviFormati(accept: string): string {
  const nomi = vociAccept(accept).map((voce) => {
    if (NOMI[voce]) return NOMI[voce];
    return voce.startsWith(".") ? voce.slice(1).toUpperCase() : "";
  });
  return [...new Set(nomi.filter(Boolean))].join(", ");
}

export interface EsitoFile {
  ammessi: File[];
  rifiutati: File[];
  /** Più file dove il campo ne prende uno solo. */
  troppi: boolean;
}

export function valutaFile(files: File[], input: Pick<HTMLInputElement, "accept" | "multiple">, senzaFiltro = false): EsitoFile {
  if (files.length > 1 && !input.multiple) return { ammessi: [], rifiutati: [], troppi: true };
  if (senzaFiltro) return { ammessi: files, rifiutati: [], troppi: false };
  const ammessi = files.filter((f) => formatoAmmesso(f, input.accept));
  return { ammessi, rifiutati: files.filter((f) => !ammessi.includes(f)), troppi: false };
}

export interface MessaggioRilascio {
  titolo: string;
  descrizione?: string;
}

/** Cosa dire quando non tutti i file possono entrare. Null se è andato tutto bene. */
export function messaggioEsito(esito: EsitoFile, accept: string): MessaggioRilascio | null {
  if (esito.troppi) {
    return { titolo: "Qui si può caricare un solo file", descrizione: "Rilascia un file alla volta." };
  }
  if (esito.rifiutati.length === 0) return null;
  const formati = descriviFormati(accept);
  const descrizione = formati ? `Qui si possono caricare: ${formati}.` : undefined;
  if (esito.rifiutati.length === 1) {
    return { titolo: `«${esito.rifiutati[0].name}» non si può caricare qui`, descrizione };
  }
  const nomi = esito.rifiutati.slice(0, 3).map((f) => f.name).join(", ");
  const altri = esito.rifiutati.length > 3 ? ` e altri ${esito.rifiutati.length - 3}` : "";
  return { titolo: `${esito.rifiutati.length} file non si possono caricare qui`, descrizione: [`${nomi}${altri}.`, descrizione].filter(Boolean).join(" ") };
}

export interface ZonaRilascio {
  input: HTMLInputElement;
  elemento: HTMLElement;
}

function haMisure(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function dentroSfondo(el: Element): boolean {
  return !!el.parentElement?.closest('[aria-hidden="true"],[inert]');
}

/**
 * Un input nascosto va bene: quasi tutti lo sono, dietro un pulsante. Non va
 * bene se a essere nascosto è il blocco che lo contiene: è la versione per
 * telefono di un altro campo, o una scheda chiusa.
 */
function bloccoNascosto(input: HTMLInputElement): boolean {
  const padre = input.parentElement;
  if (!padre) return true;
  if (haMisure(padre)) return false;
  return padre.children.length > 1 || !!padre.textContent?.trim();
}

/** Fotocamera e galleria stanno spesso affiancate, nascoste: resta una, quella che prende file. */
function togliGemelli(inputs: HTMLInputElement[]): HTMLInputElement[] {
  const perPadre = new Map<Element, HTMLInputElement[]>();
  for (const input of inputs) {
    if (haMisure(input) || !input.parentElement) continue;
    perPadre.set(input.parentElement, [...(perPadre.get(input.parentElement) ?? []), input]);
  }
  const punteggio = (i: HTMLInputElement) => (i.hasAttribute("capture") ? 0 : 2) + (i.multiple ? 1 : 0);
  const scartati = new Set<HTMLInputElement>();
  for (const gruppo of perPadre.values()) {
    if (gruppo.length < 2) continue;
    const migliore = [...gruppo].sort((a, b) => punteggio(b) - punteggio(a))[0];
    gruppo.filter((i) => i !== migliore).forEach((i) => scartati.add(i));
  }
  return inputs.filter((i) => !scartati.has(i));
}

function vicinoVisibile(input: HTMLInputElement): HTMLElement | null {
  const etichetta = input.id
    ? Array.from(input.ownerDocument.querySelectorAll("label")).find((l) => l.htmlFor === input.id)
    : undefined;
  const vicini = [etichetta, input.closest("label"), input.nextElementSibling, input.previousElementSibling];
  return (vicini.find((el) => el && haMisure(el)) as HTMLElement | undefined) ?? null;
}

function zonaDi(input: HTMLInputElement, candidati: HTMLInputElement[]): HTMLElement | null {
  const altri = candidati.filter((c) => c !== input);
  const contieneAltri = (el: Element) => altri.some((c) => el.contains(c));

  const esplicita = input.closest<HTMLElement>(`[${ATTR_ZONA}]`);
  if (esplicita && !contieneAltri(esplicita)) return esplicita;

  // Una finestra con un solo caricamento: vale tutta la finestra.
  const dialogo = input.closest<HTMLElement>(DIALOGHI);
  if (dialogo && !contieneAltri(dialogo)) return dialogo;

  const body = input.ownerDocument.body;
  let zona: HTMLElement = input;
  for (let p = input.parentElement; p && p !== body && p.id !== "root"; p = p.parentElement) {
    if (contieneAltri(p)) break;
    zona = p;
    if (p.matches(CONFINI)) break;
  }
  return haMisure(zona) ? zona : vicinoVisibile(input);
}

/** Tutte le aree di rilascio a schermo. Sotto una finestra aperta la pagina non conta. */
export function calcolaZone(doc: Document): ZonaRilascio[] {
  const inputs = Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="file"]')).filter(
    (i) => i.dataset.rilascio !== "no" && !dentroSfondo(i) && !bloccoNascosto(i),
  );
  const candidati = togliGemelli(inputs);
  return candidati.flatMap((input) => {
    const elemento = zonaDi(input, candidati);
    return elemento && haMisure(elemento) ? [{ input, elemento }] : [];
  });
}

/** L'area sotto il mouse. Sullo sfondo di una finestra con un solo caricamento vale quello. */
export function zonaSotto(bersaglio: EventTarget | null, zone: ZonaRilascio[]): ZonaRilascio | null {
  if (!(bersaglio instanceof Element)) return null;
  const sotto = zone.filter((z) => z.elemento.contains(bersaglio));
  const piuInterna = sotto.find((z) => !sotto.some((a) => a !== z && z.elemento.contains(a.elemento)));
  if (piuInterna) return piuInterna;
  // `aria-hidden` da solo non basta: ce l'hanno anche le icone.
  const sfondoDiFinestra = !!bersaglio.closest('[aria-hidden="true"]') && !!zone[0]?.input.closest(DIALOGHI);
  return sfondoDiFinestra && zone.length === 1 ? zone[0] : null;
}

/** Mette i file nel campo e lo fa scattare come dopo una scelta dal selettore. */
export function consegnaFile(input: HTMLInputElement, files: File[]): void {
  const contenitore = new DataTransfer();
  files.forEach((f) => contenitore.items.add(f));
  input.files = contenitore.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
