import { leggiAllegatoLocale, salvaAllegatiRipristinati } from "./allegatiLocali";
import { leggiBozzaComputo, type BozzaComputo } from "./editorNativo";

const MAX_FILE = 20 * 1024 * 1024;
const MAX_TOTALE = 50 * 1024 * 1024;
export const MAX_BACKUP_COMPUTO = 75 * 1024 * 1024;
const FORMATO = "ediliziaincloud-computo";

function leggiDati(testo: string): BozzaComputo {
  try { return leggiBozzaComputo(testo); }
  catch { throw new Error("Dati della bozza non validi o versione non supportata."); }
}

function base64(bytes: Uint8Array): string {
  const parti: string[] = [];
  for (let i = 0; i < bytes.length; i += 16384) parti.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
  return btoa(parti.join(""));
}

export async function creaBackupComputo(scope: string, bozza: BozzaComputo): Promise<Blob> {
  const valida = leggiDati(JSON.stringify(bozza));
  const allegati: { id: string; dati: string }[] = [];
  let totale = 0;
  for (const meta of valida.allegati) {
    const blob = await leggiAllegatoLocale(scope, meta.id);
    if (!blob) throw new Error(`Copia incompleta: manca ${meta.nome}. Ricarica il file o rimuovilo dal progetto prima di creare la copia.`);
    if (blob.size !== meta.dimensione || blob.type !== meta.mime || blob.size > MAX_FILE || (totale += blob.size) > MAX_TOTALE) {
      throw new Error("Allegati non coerenti o troppo grandi: massimo 20 MB per file e 50 MB complessivi.");
    }
    allegati.push({ id: meta.id, dati: base64(new Uint8Array(await blob.arrayBuffer())) });
  }
  const copia = new Blob([JSON.stringify({ formato: FORMATO, versione: 1, bozza: valida, allegati })], { type: "application/json" });
  if (copia.size > MAX_BACKUP_COMPUTO) throw new Error("Copia troppo grande: riduci gli allegati o i dati del progetto.");
  return copia;
}

export async function ripristinaBackupComputo(scope: string, testo: string): Promise<BozzaComputo> {
  if (testo.length > MAX_BACKUP_COMPUTO) throw new Error("Copia troppo grande: massimo 75 MB.");
  let contenuto: unknown;
  try { contenuto = JSON.parse(testo); } catch { throw new Error("File bozza non valido."); }
  if (!contenuto || typeof contenuto !== "object" || !("formato" in contenuto)) {
    const bozza = leggiDati(testo);
    for (const meta of bozza.allegati) {
      const blob = await leggiAllegatoLocale(scope, meta.id);
      if (!blob || blob.size !== meta.dimensione || blob.type !== meta.mime) throw new Error("Questa vecchia copia non contiene i file del progetto. Crea una copia completa dal browser originale.");
    }
    return bozza;
  }
  const backup = contenuto as { formato?: unknown; versione?: unknown; bozza?: unknown; allegati?: unknown };
  if (backup.formato !== FORMATO || backup.versione !== 1 || !Array.isArray(backup.allegati)) throw new Error("Formato della copia non supportato.");
  const bozza = leggiDati(JSON.stringify(backup.bozza));
  if (backup.allegati.length !== bozza.allegati.length) throw new Error("Copia incompleta: il numero degli allegati non corrisponde.");
  const files = new Map<string, string>();
  for (const item of backup.allegati) {
    if (!item || typeof item.id !== "string" || typeof item.dati !== "string" || files.has(item.id)) throw new Error("Elenco allegati non valido.");
    files.set(item.id, item.dati);
  }
  let totale = 0;
  const ripristinati: { id: string; blob: Blob }[] = [];
  const allegati = bozza.allegati.map(meta => {
    const dati = files.get(meta.id);
    if (!dati || dati.length > Math.ceil(MAX_FILE / 3) * 4 || dati.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(dati)) throw new Error(`Allegato non valido: ${meta.nome}.`);
    const binario = atob(dati);
    if (binario.length !== meta.dimensione || binario.length > MAX_FILE || (totale += binario.length) > MAX_TOTALE) throw new Error("Dimensioni degli allegati non coerenti o fuori limite.");
    const bytes = Uint8Array.from(binario, c => c.charCodeAt(0));
    const id = crypto.randomUUID();
    ripristinati.push({ id, blob: new Blob([bytes], { type: meta.mime }) });
    return { ...meta, id };
  });
  if (ripristinati.length) await salvaAllegatiRipristinati(scope, ripristinati);
  return { ...bozza, allegati };
}
