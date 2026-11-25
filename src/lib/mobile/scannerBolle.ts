import { Capacitor, registerPlugin } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

interface ScannerDocumenti {
  scan(input: { pageLimit: number; byteBudget: number }): Promise<{
    scanId?: string;
    pageCount?: number;
    cancelled?: boolean;
  }>;
  recognizePage(input: { scanId: string; page: number }): Promise<{ text: string }>;
}

const nomePlugin = "CampoDocumentScanner";
const scanner = registerPlugin<ScannerDocumenti>(nomePlugin);
const idValido = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const cartellaScansione = (id: string) => `scanner-ddt/${id}`;

export type ScansioneBolla = {
  id: string;
  pagine: Array<{ file: File; byte: ArrayBuffer }>;
};

export function scannerBolleDisponibile(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(nomePlugin);
}

export async function scartaCopiaScansione(id: string): Promise<void> {
  if (!idValido.test(id)) return;
  // Le pagine che interessano sono già in memoria o nella coda offline.
  await Filesystem.rmdir({ path: cartellaScansione(id), directory: Directory.Cache, recursive: true }).catch(() => {});
}

export async function scansionaBolla(pageLimit: number, byteBudget: number): Promise<ScansioneBolla | null> {
  const { cancelled, scanId, pageCount } = await scanner.scan({ pageLimit, byteBudget });
  if (cancelled) return null;
  if (!scanId || !idValido.test(scanId)) throw new Error("Scansione non disponibile.");
  try {
    if (pageCount == null || !Number.isInteger(pageCount) || pageCount < 1 || pageCount > pageLimit) {
      throw new Error("Numero di pagine della scansione non valido.");
    }
    let rimasti = byteBudget;
    const pagine: ScansioneBolla["pagine"] = [];
    for (let indice = 1; indice <= pageCount; indice++) {
      const nome = `pagina-${indice}.jpg`;
      const { data } = await Filesystem.readFile({ path: `${cartellaScansione(scanId)}/${nome}`, directory: Directory.Cache });
      if (typeof data !== "string") throw new Error("Impossibile leggere una pagina della scansione.");
      if (data.length > Math.ceil(rimasti / 3) * 4) throw new Error("Le pagine superano lo spazio disponibile per questa bolla.");
      const binario = atob(data);
      if (!binario.length || binario.length > rimasti) throw new Error("Una pagina della scansione è vuota o troppo grande.");
      const byte = Uint8Array.from(binario, carattere => carattere.charCodeAt(0)).buffer;
      rimasti -= byte.byteLength;
      pagine.push({ file: new File([byte], nome, { type: "image/jpeg" }), byte });
    }
    return { id: scanId, pagine };
  } catch (errore) {
    await scartaCopiaScansione(scanId);
    throw errore;
  }
}

export async function leggiScansioneBolla(scansione: ScansioneBolla): Promise<Array<{ file: File; testo: string }>> {
  const letture: Array<{ file: File; testo: string }> = [];
  try {
    for (const [indice, { file }] of scansione.pagine.entries()) {
      const esito = await scanner.recognizePage({ scanId: scansione.id, page: indice + 1 }).catch((): null => null);
      letture.push({ file, testo: typeof esito?.text === "string" ? esito.text : "" });
    }
    return letture;
  } finally {
    await scartaCopiaScansione(scansione.id);
  }
}
