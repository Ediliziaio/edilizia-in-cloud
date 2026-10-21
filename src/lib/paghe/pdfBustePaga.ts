/**
 * La parte «browser» del caricamento buste paga: apre i file (PDF o ZIP),
 * estrae il testo di ogni pagina con pdfjs e ritaglia ogni documento in un PDF
 * suo con pdf-lib. Tutto resta sul computer di chi carica finché non si salva.
 */
import { completaNomi, leggiPagina, raggruppaPagine, riconosciProgramma, type DocumentoLetto } from "./lettoreBustePaga";

async function pdfjs() {
  const lib = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  if (typeof worker === "string" && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = worker;
  return lib;
}

export interface FilePaghe {
  nome: string;
  byte: Uint8Array;
}

/** I PDF dentro i file scelti: gli ZIP si aprono, il resto si scarta. */
export async function espandiFile(files: File[]): Promise<{ pdf: FilePaghe[]; scartati: string[] }> {
  const pdf: FilePaghe[] = [];
  const scartati: string[] = [];
  for (const f of files) {
    const nome = f.name;
    if (/\.zip$/i.test(nome)) {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(await f.arrayBuffer());
      for (const voce of Object.values(zip.files)) {
        if (voce.dir || voce.name.startsWith("__MACOSX/")) continue;
        if (/\.pdf$/i.test(voce.name)) pdf.push({ nome: voce.name.split("/").pop()!, byte: await voce.async("uint8array") });
        else scartati.push(voce.name);
      }
    } else if (/\.pdf$/i.test(nome) || f.type === "application/pdf") {
      pdf.push({ nome, byte: new Uint8Array(await f.arrayBuffer()) });
    } else {
      scartati.push(nome);
    }
  }
  return { pdf, scartati };
}

/** Le righe di testo di ogni pagina: pezzi sulla stessa altezza, da sinistra a destra, uniti da « | ». */
export async function righePerPagina(byte: Uint8Array): Promise<string[][]> {
  const lib = await pdfjs();
  const caricamento = lib.getDocument({ data: byte.slice() });
  const doc = await caricamento.promise;
  const pagine: string[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const contenuto = await (await doc.getPage(p)).getTextContent();
    const righe = new Map<number, { x: number; s: string }[]>();
    for (const it of contenuto.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const chiave = [...righe.keys()].find((yy) => Math.abs(yy - y) <= 2) ?? y;
      if (!righe.has(chiave)) righe.set(chiave, []);
      righe.get(chiave)!.push({ x: it.transform[4], s: it.str.trim() });
    }
    pagine.push([...righe.keys()].sort((a, b) => b - a).map((y) => righe.get(y)!.sort((a, b) => a.x - b.x).map((i) => i.s).join(" | ")));
  }
  await caricamento.destroy();
  return pagine;
}

export interface DocumentoDaFile extends DocumentoLetto {
  /** Chiave stabile nell'anteprima. */
  chiave: string;
  file: FilePaghe;
}

/** Legge un file intero: un documento per ogni gruppo di pagine. */
export async function leggiFile(file: FilePaghe): Promise<{ documenti: DocumentoDaFile[]; pagine: number; programma: string | null }> {
  const righe = await righePerPagina(file.byte);
  const documenti = completaNomi(raggruppaPagine(righe.map((r, i) => leggiPagina(r, i))));
  return {
    documenti: documenti.map((d) => ({ ...d, chiave: `${file.nome}#${d.pagine.join("-")}`, file })),
    pagine: righe.length,
    programma: riconosciProgramma(righe.flat().join("\n")),
  };
}

/** Il PDF di un solo documento, ritagliato dalle sue pagine. */
export async function ritagliaPdf(file: FilePaghe, pagine: number[]): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const sorgente = await PDFDocument.load(file.byte, { ignoreEncryption: true });
  if (pagine.length === sorgente.getPageCount()) return file.byte;
  const nuovo = await PDFDocument.create();
  for (const pagina of await nuovo.copyPages(sorgente, pagine)) nuovo.addPage(pagina);
  return nuovo.save();
}
