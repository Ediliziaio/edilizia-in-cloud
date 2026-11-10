import type { EsitoImportComputo } from "./importaComputo";
import type { StatoServer } from "./estrazioneServer";
import { daComputoStrutturato, daEstrazioneServer, instrada, type Fase, type VoceImportata } from "./importaVoci";
import type { ComputoVoceEstratta } from "@/types/computo";

/**
 * Legge un file per «Importa voci» e racconta a che punto è.
 *
 * Le fasi sono vere: «Leggo le righe» arriva quando il file è aperto, «Riconosco
 * le voci» quando le righe sono lette, e la percentuale delle letture sul server
 * viene dalle pagine che la funzione dice di aver letto.
 */

export interface Avanzamento {
  fase: Fase;
  /** «12 pagine su 40», «Analisi con l'AI»: cosa sta succedendo dentro la fase. */
  dettaglio?: string;
  /** Avanzamento dentro la fase, da 0 a 1, quando si conosce. */
  parte?: number;
}

export interface EsitoFile {
  formato: string;
  via: "browser" | "server";
  esito: EsitoImportComputo;
  voci: VoceImportata[];
}

export interface OpzioniLettura {
  onAvanzamento: (a: Avanzamento) => void;
  /** La lettura sul server. Assente dove l'AI non è attiva: i file che la richiedono si rifiutano con un motivo. */
  server?: (file: File, onStato: (s: StatoServer) => void) => Promise<ComputoVoceEstratta[]>;
}

export const MESSAGGIO_SENZA_SERVER = "Per leggere questo file serve l'AI, che qui non è attiva. Vanno bene PriMus (XPWE), il PDF stampato da PriMus, Excel (.xlsx), CSV e Word con una tabella.";

/** Le pagine lette, quando la funzione le scrive («3/10 pagine lette; …»). */
function partePagine(dettaglio?: string): number | undefined {
  const m = dettaglio?.match(/(\d+)\s*\/\s*(\d+)\s*pagine/);
  return m && Number(m[2]) > 0 ? Math.min(1, Number(m[1]) / Number(m[2])) : undefined;
}

function faseServer(s: StatoServer): Avanzamento {
  const pagine = s.dettaglio?.match(/(\d+)\s*\/\s*(\d+)\s*pagine/);
  const dettaglioPagine = pagine ? `${pagine[1]} pagine su ${pagine[2]}` : undefined;
  switch (s.stato) {
    case "uploading": return { fase: "apro", dettaglio: "Caricamento del file" };
    case "extracting_text": return { fase: "leggo", dettaglio: dettaglioPagine, parte: partePagine(s.dettaglio) };
    case "analyzing_ai": return { fase: "riconosco", dettaglio: dettaglioPagine ? `${dettaglioPagine} · analisi delle voci` : "Analisi delle voci" };
    case "validating": return { fase: "riconosco", dettaglio: "Controllo dei totali", parte: 0.9 };
    default: return { fase: "pronte" };
  }
}

async function sulServer(file: File, formato: string, o: OpzioniLettura): Promise<EsitoFile> {
  if (!o.server) throw new Error(MESSAGGIO_SENZA_SERVER);
  const estratte = await o.server(file, s => o.onAvanzamento(faseServer(s)));
  const { esito, voci } = daEstrazioneServer(estratte, file.name);
  if (!voci.length) throw new Error("Nel file non ho trovato voci di computo: righe con descrizione, unità, quantità e prezzo.");
  return { formato, via: "server", esito, voci };
}

/** Un documento Word senza tabella: il testo va all'estrazione sul server come PDF, l'unico testo che sa leggere. */
async function pdfDalTesto(testo: string, nome: string): Promise<File> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.setFontSize(10);
  const righe: string[] = pdf.splitTextToSize(testo, 180);
  let y = 15;
  for (const riga of righe) {
    if (y > 282) { pdf.addPage(); y = 15; }
    pdf.text(riga, 15, y);
    y += 4.5;
  }
  return new File([pdf.output("blob")], nome.replace(/\.docx$/i, ".pdf"), { type: "application/pdf" });
}

export async function leggiVociDaFile(file: File, o: OpzioniLettura): Promise<EsitoFile> {
  const strada = instrada(file);
  if (strada.via === "no") throw new Error(strada.motivo);
  if (strada.via === "server") return sulServer(file, strada.formato, o);

  o.onAvanzamento({ fase: "apro" });
  const dati = await file.arrayBuffer();
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const daStruttura = (c: Parameters<typeof daComputoStrutturato>[0]): EsitoFile => {
    o.onAvanzamento({ fase: "riconosco" });
    const { esito, voci } = daComputoStrutturato(c, file.name);
    return { formato: strada.formato, via: "browser", esito, voci };
  };

  if (ext === "csv" || ext === "tsv" || file.type === "text/csv") {
    const { decodificaCsv, leggiComputoCsv } = await import("./tabelleDocumento");
    o.onAvanzamento({ fase: "leggo" });
    return daStruttura(leggiComputoCsv(decodificaCsv(dati)));
  }

  if (ext === "docx") {
    const { computoDaTabelleWord, leggiDocumentoWord } = await import("./tabelleDocumento");
    o.onAvanzamento({ fase: "leggo" });
    const word = await leggiDocumentoWord(dati);
    const computo = computoDaTabelleWord(word);
    if (computo) return daStruttura(computo);
    if (!word.testo.trim()) throw new Error("Il documento Word è vuoto.");
    return sulServer(await pdfDalTesto(word.testo, file.name), strada.formato, o);
  }

  // PriMus (PDF o XPWE) ed Excel: i lettori già usati dall'editor del computo.
  const { leggiFileComputo, PdfDaLeggereConAi } = await import("./leggiFileComputo");
  o.onAvanzamento({ fase: "leggo" });
  try {
    return daStruttura(await leggiFileComputo(new File([dati], ext === "pwe" || ext === "xml" ? file.name.replace(/\.\w+$/, ".xpwe") : file.name, { type: file.type })));
  } catch (e) {
    if (e instanceof PdfDaLeggereConAi) return sulServer(file, strada.formato, o);
    throw e;
  }
}
