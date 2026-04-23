/**
 * Edge Function: computo-ai-extract
 * Estrae voci da computi metrici (PDF/XLSX/XPWE) usando AI
 * Multi-strategy: pdf_text, pdf_vision, xlsx_parse, xpwe_parse
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Buffer } from "node:buffer";
import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

// ── Tipi ─────────────────────────────────────────────────────────────────────
interface VoceEstratta {
  capitolo_numero: number;
  capitolo_nome: string;
  codice_voce: string;
  codice_prezzario: string;
  descrizione_breve: string;
  descrizione_estesa: string;
  unita_misura: string;
  quantita: number;
  prezzo_unitario: number;
  importo: number;
  confidence: number;
  warnings: string[];
}

interface ExtractionResult {
  metadata: {
    oggetto_lavori?: string;
    committente?: string;
    progettista?: string;
    data_computo?: string;
    totale_computo?: number;
  };
  capitoli: Array<{
    numero: number;
    nome: string;
    totale: number;
    voci: VoceEstratta[];
  }>;
}

// ── Prompt AI ────────────────────────────────────────────────────────────────
const COMPUTO_TEXT_EXTRACTION_PROMPT = `Sei un esperto di computi metrici estimativi italiani per l'edilizia, in particolare:
- Prezzari regionali (Lombardia/DEI/Piemonte/Veneto/Regione Sicilia/Emilia-Romagna...)
- Formati CEPA, XPWE, XML di Primus/STR Vision/Acca
- Lavorazioni standard: murature, intonaci, serramenti, pavimenti, impianti, opere provvisionali

Analizza il seguente testo estratto da un computo metrico e restituisci un JSON strutturato.

REGOLE CRITICHE NUMERAZIONE:
1. Numeri italiani: punto = migliaia, virgola = decimali. "1.234,56" → 1234.56. "234,50" → 234.50.
2. Numeri con apostrofo/spazio: "1'234.56" o "1 234,56" → 1234.56.
3. Se un numero ha solo decimali (es. ",56") → 0.56.
4. Se trovi "TOT.", "TOTALE", "SOMMA", "A riportare" usa questi come importi di chiusura.

REGOLE DESCRIZIONI:
5. Descrizioni multi-riga: concatena con spazio singolo, rimuovi newline superflui.
6. Se la descrizione ha sottoelenchi numerati (es. "a. opera x\\nb. opera y") mantieni la struttura con separatore.
7. descrizione_breve = primi 100 char più informativi (nome lavoro principale).
8. descrizione_estesa = testo completo.

REGOLE CODICI:
9. codice_voce = numerazione progressiva del computo (es. "1.1", "1.01.02", "A-001").
10. codice_prezzario = se riconosci un codice regionale/DEI/privato (pattern comuni: E.01.001, NP.01.A, PR.CM, B.02.010), mettilo qui. Altrimenti stringa vuota.
11. U.M. standard: mq, mc, ml, kg, cad, a corpo, lt, q, t, nr, h, gg, m, km, m², m³, ml. Normalizza: m² → mq, m³ → mc.

REGOLE CAPITOLI:
12. Raggruppa per capitolo/sezione (es. "SCAVI", "MURATURE", "FINITURE"). Se il documento ha capitoli numerati, usa quella numerazione.
13. Se non ci sono capitoli espliciti, crea "Generale" come unico capitolo.
14. Ogni capitolo deve avere totale = somma degli importi delle voci incluse.

REGOLE CONFIDENCE:
15. confidence 0.95+ se prezzo E quantità E descrizione chiare.
16. confidence 0.7-0.9 se manca 1 campo o è ambiguo.
17. confidence < 0.5 se il testo è troppo corrotto/incompleto. Aggiungi warnings[] descrittivi.

REGOLE VALIDAZIONE CROSS-CHECK:
18. Se quantita × prezzo_unitario differisce da importo per oltre 1% → warnings: "Ricalcolo: <valore>".
19. Mantieni SEMPRE l'ordine originale delle voci nel documento.
20. NON inventare dati. Se manca, lascia null o 0 e aggiungi warning.

Restituisci SOLO JSON valido (niente markdown) con questa struttura:
{
  "metadata": {
    "oggetto_lavori": "string o null",
    "committente": "string o null",
    "progettista": "string o null",
    "data_computo": "YYYY-MM-DD o null",
    "totale_computo": number o null
  },
  "capitoli": [
    {
      "numero": 1,
      "nome": "Nome capitolo",
      "totale": 12345.67,
      "voci": [
        {
          "capitolo_numero": 1,
          "capitolo_nome": "Nome capitolo",
          "codice_voce": "1.1",
          "codice_prezzario": "E.01.001 o vuoto",
          "descrizione_breve": "max 100 caratteri",
          "descrizione_estesa": "descrizione completa multi-riga",
          "unita_misura": "mq",
          "quantita": 45.50,
          "prezzo_unitario": 18.50,
          "importo": 841.75,
          "confidence": 0.95,
          "warnings": []
        }
      ]
    }
  ]
}`;

const COMPUTO_METADATA_PROMPT = `Analizza l'intestazione di questo computo metrico estimativo italiano.
Estrai SOLO i metadata generali del documento.
Restituisci JSON: { "oggetto_lavori": "", "committente": "", "progettista": "", "data_computo": "YYYY-MM-DD", "totale_computo": null }`;

const COMPUTO_CHAPTER_PROMPT = `Analizza questo capitolo di un computo metrico estimativo italiano.
Estrai tutte le voci di lavorazione con: codice, descrizione, U.M., quantità, prezzo unitario, importo.
Numeri italiani: 1.234,56 → 1234.56.
Restituisci JSON: { "voci": [ { "capitolo_numero": N, "capitolo_nome": "", "codice_voce": "", "codice_prezzario": "", "descrizione_breve": "", "descrizione_estesa": "", "unita_misura": "", "quantita": 0, "prezzo_unitario": 0, "importo": 0, "confidence": 0.9, "warnings": [] } ] }`;

// MP-preventivi-v2: prompt dedicato per foto di preventivi cartacei/schizzi/fatti a mano.
// Usato quando file_type === "image". L'AI deve essere più flessibile:
// il documento può NON essere un computo metrico formale ma un "foglietto"
// con prodotti/misure/prezzi scritti liberamente.
const FOTO_PREVENTIVO_PROMPT = `Sei un esperto di preventivi edili italiani. Stai analizzando FOTO (non documenti strutturati).

CONTESTI POSSIBILI:
- Preventivo cartaceo scritto a mano da un commerciale o cliente.
- Schizzo di lavoro con misure e prodotti appuntati.
- Foto di una lavagna/quaderno con elenco prodotti.
- Screenshot di un preventivo PDF informale.
- Foto del luogo dei lavori con note a margine.

OBIETTIVO: Estrarre le voci lavorative (prodotti, quantità, misure, prezzi se presenti) e
restituire la struttura di un computo metrico. Il commerciale rivedrà e confermerà le voci.

REGOLE CRITICHE:
1. Sii MAI inventivo su prodotti/prezzi non visibili. Meglio nessuna voce che dati falsi.
2. Numeri italiani: "1.234,56" → 1234.56. "m. 1,20" → 1.2. "mq. 45" → 45 (U.M. = mq).
3. Se trovi misure come "120×140" riconosci L×H in cm (default) e converti se serve.
4. Se il prezzo è illeggibile/mancante → prezzo_unitario = 0, confidence = 0.3, warning = "prezzo non leggibile".
5. Se la quantità non c'è e non deducibile → 1 (default) + warning = "quantità non specificata".
6. Se il prodotto è generico (es. "finestra") → descrizione breve chiara, no codice_prezzario.
7. Unisci voci ripetute se l'utente le ha scritte come "x2 finestre 120x140" → quantita=2.
8. Se trovi TOTALE scritto in fondo alla foto → includi in metadata.totale_computo.
9. confidence: 0.7 se la scrittura è chiara, 0.5 se difficoltosa, 0.3 se ambigua.
10. Se la foto è del LUOGO (non di un preventivo) e vedi lavori necessari (es. "finestre vecchie da sostituire")
    genera righe descrittive con confidence=0.5 + warning="derivato da contesto visivo".

STRUTTURA CAPITOLI:
- Raggruppa per tipo di lavoro (es. "Serramenti", "Pavimenti", "Impianti") se deducibile.
- Se un solo tipo → capitolo unico.

Restituisci SOLO JSON valido (no markdown) con la stessa struttura del COMPUTO_TEXT_EXTRACTION.
Esempio capitolo: { "numero": 1, "nome": "Serramenti", "totale": N, "voci": [...] }
Ogni voce: { "capitolo_numero", "capitolo_nome", "codice_voce", "codice_prezzario", "descrizione_breve", "descrizione_estesa", "unita_misura", "quantita", "prezzo_unitario", "importo", "confidence", "warnings": [] }`;

// ── Helpers ──────────────────────────────────────────────────────────────────

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function updateStatus(
  computoId: string,
  status: string,
  extra: Record<string, unknown> = {}
) {
  const { error } = await sb
    .from("computo_uploads")
    .update({ extraction_status: status, ...extra })
    .eq("id", computoId);
  if (error) console.error("updateStatus error:", error.message);
}

async function callOpenAI(
  messages: Array<{ role: string; content: unknown }>,
  maxTokens = 4000
): Promise<unknown> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
      temperature: 0.1,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI error: ${JSON.stringify(data)}`);

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty response");

  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`OpenAI returned invalid JSON: ${content.substring(0, 200)}`);
  }
}

// ── Strategy 1: PDF Text ─────────────────────────────────────────────────────

async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
  try {
    // Use pdfjs-dist for text extraction (Deno-compatible)
    const pdfjsLib = await import("npm:pdfjs-dist@4.0.379/legacy/build/pdf.mjs");
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      pages.push(pageText);
    }

    return pages.join("\n\n");
  } catch (err: any) {
    console.error("PDF text extraction error:", err.message);
    return "";
  }
}

function splitByChapters(text: string): Array<{ number: number; name: string; text: string }> {
  const chapterPatterns = [
    /(?:^|\n)\s*(?:CAP(?:ITOLO)?\.?\s*(\d+)[.:)\s-]+(.+?))\s*\n/gim,
    /(?:^|\n)\s*(\d+)\s*[.)]\s*([A-Z][A-Za-z\s]+)\s*\n/gm,
    /(?:^|\n)\s*(?:CATEGORIA\s+(\d+)[.:)\s-]+(.+?))\s*\n/gim,
  ];

  for (const pattern of chapterPatterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length >= 2) {
      const chapters = [];
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index!;
        const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
        chapters.push({
          number: parseInt(matches[i][1]) || i + 1,
          name: matches[i][2]?.trim() || `Capitolo ${i + 1}`,
          text: text.substring(start, end),
        });
      }
      return chapters;
    }
  }

  return [{ number: 1, name: "Generale", text }];
}

async function analyzeWithAI(
  fullText: string,
  computoId: string
): Promise<ExtractionResult> {
  const chapters = splitByChapters(fullText);

  if (chapters.length === 1 && fullText.length < 30000) {
    const result = (await callOpenAI([
      { role: "system", content: COMPUTO_TEXT_EXTRACTION_PROMPT },
      { role: "user", content: fullText },
    ], 8000)) as ExtractionResult;
    return result;
  }

  // Multi-chunk
  const metadata = (await callOpenAI([
    { role: "system", content: COMPUTO_METADATA_PROMPT },
    { role: "user", content: fullText.substring(0, 5000) },
  ])) as ExtractionResult["metadata"];

  const capitoli: ExtractionResult["capitoli"] = [];
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    await updateStatus(computoId, "analyzing_ai", {
      raw_extracted_json: { progress: `Capitolo ${i + 1} di ${chapters.length}` },
    });

    const chunkSize = 28000;
    const chapterText = chapter.text;
    if (chapterText.length > chunkSize) {
      const allVoci: VoceEstratta[] = [];
      for (let j = 0; j < chapterText.length; j += chunkSize) {
        const sub = chapterText.substring(j, j + chunkSize);
        const subResult = (await callOpenAI([
          { role: "system", content: COMPUTO_CHAPTER_PROMPT },
          { role: "user", content: `Capitolo ${chapter.number}: ${chapter.name}\n\n${sub}` },
        ], 8000)) as { voci?: VoceEstratta[] };
        if (subResult.voci) allVoci.push(...subResult.voci);
      }
      capitoli.push({
        numero: chapter.number,
        nome: chapter.name,
        totale: allVoci.reduce((s, v) => s + (v.importo || 0), 0),
        voci: allVoci,
      });
    } else {
      const result = (await callOpenAI([
        { role: "system", content: COMPUTO_CHAPTER_PROMPT },
        { role: "user", content: `Capitolo ${chapter.number}: ${chapter.name}\n\n${chapterText}` },
      ], 8000)) as { voci?: VoceEstratta[] };
      const voci = result.voci || [];
      capitoli.push({
        numero: chapter.number,
        nome: chapter.name,
        totale: voci.reduce((s, v) => s + (v.importo || 0), 0),
        voci,
      });
    }
  }

  return { metadata, capitoli };
}

// ── Strategy 2: PDF Vision (per PDF con poco testo estraibile) ───────────────

async function extractFromPDFVision(
  buffer: ArrayBuffer,
  computoId: string
): Promise<ExtractionResult> {
  // Try to extract text per page using pdfjs-dist
  let numPages = 0;
  const pageTexts: string[] = [];

  try {
    const pdfjsLib = await import("npm:pdfjs-dist@4.0.379/legacy/build/pdf.mjs");
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    numPages = pdf.numPages;

    for (let i = 1; i <= numPages; i++) {
      await updateStatus(computoId, "analyzing_ai", {
        raw_extracted_json: { progress: `Pagina ${i} di ${numPages}` },
      });
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      pageTexts.push(pageText);
    }
  } catch (err: any) {
    console.error("PDF Vision text extraction error:", err.message);
    // If pdfjs fails entirely, return empty result
    return { metadata: {}, capitoli: [] };
  }

  // Process page texts with AI
  const allText = pageTexts.join("\n\n");
  if (allText.trim().length > 200) {
    // There IS text - use text-based extraction
    return await analyzeWithAI(allText, computoId);
  }

  // Truly scanned PDF with no text - return empty with error
  // (Real Vision OCR with image rendering not available in Deno edge runtime)
  return {
    metadata: {},
    capitoli: [{
      numero: 1,
      nome: "Generale",
      totale: 0,
      voci: [],
    }],
  };
}

// ── Strategy 3: Excel ────────────────────────────────────────────────────────

async function extractFromExcel(buffer: ArrayBuffer): Promise<ExtractionResult> {
  const XLSX = (await import("npm:xlsx@0.18.5")).default;
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const headerKeywords = ["codice", "descrizione", "u.m", "quantit", "prezzo", "importo"];
  let headerRowIdx = -1;
  let columnMapping: Record<string, number> = {};

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!row) continue;
    const rowStr = row.map((c: any) => String(c || "").toLowerCase()).join("|");
    const matches = headerKeywords.filter((k) => rowStr.includes(k));
    if (matches.length >= 3) {
      headerRowIdx = i;
      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] || "").toLowerCase();
        if (cell.includes("codice") && !columnMapping.codice) columnMapping.codice = j;
        if (cell.includes("descrizione") && !columnMapping.descrizione) columnMapping.descrizione = j;
        if ((cell.includes("u.m") || cell.includes("unità") || cell.includes("unita")) && !columnMapping.um) columnMapping.um = j;
        if ((cell.includes("quantit") || cell.includes("q.tà") || cell.includes("q.ta")) && !columnMapping.quantita) columnMapping.quantita = j;
        if (cell.includes("prezzo") && !cell.includes("importo") && !columnMapping.prezzo) columnMapping.prezzo = j;
        if ((cell.includes("importo") || (cell.includes("totale") && !cell.includes("sub"))) && !columnMapping.importo) columnMapping.importo = j;
      }
      break;
    }
  }

  if (headerRowIdx === -1) {
    const sampleRows = rows.slice(0, 10).map((r) => (r || []).join(" | ")).join("\n");
    try {
      const aiResult = (await callOpenAI([
        {
          role: "system",
          content: `Analizza queste righe di un foglio Excel di un computo metrico. Identifica quale colonna (indice 0-based) corrisponde a: codice, descrizione, um (unità misura), quantita, prezzo, importo. Restituisci JSON: { "codice": N, "descrizione": N, "um": N, "quantita": N, "prezzo": N, "importo": N, "header_row": N }`,
        },
        { role: "user", content: sampleRows },
      ])) as any;
      if (aiResult.descrizione !== undefined) columnMapping = aiResult;
      headerRowIdx = aiResult.header_row || 0;
    } catch {
      // AI classification failed - try simple heuristic
      headerRowIdx = 0;
      columnMapping = { codice: 0, descrizione: 1, um: 2, quantita: 3, prezzo: 4, importo: 5 };
    }
  }

  const voci: VoceEstratta[] = [];
  let currentCap = "Generale";
  let capNum = 1;

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c: any) => !c && c !== 0)) continue;

    const desc = String(row[columnMapping.descrizione] || "").trim();
    if (!desc) continue;

    const qta = parseItalianNumber(row[columnMapping.quantita]);
    const prezzo = parseItalianNumber(row[columnMapping.prezzo]);
    const importo = parseItalianNumber(row[columnMapping.importo]);

    // Detect chapter rows
    if (!qta && !prezzo && !importo && desc.length > 3) {
      if (desc === desc.toUpperCase() || desc.startsWith("CAP")) {
        currentCap = desc;
        capNum++;
        continue;
      }
    }

    if (qta || prezzo || importo) {
      voci.push({
        capitolo_numero: capNum,
        capitolo_nome: currentCap,
        codice_voce: String(row[columnMapping.codice] || "").trim(),
        codice_prezzario: "",
        descrizione_breve: desc.substring(0, 100),
        descrizione_estesa: desc,
        unita_misura: String(row[columnMapping.um] || "").trim(),
        quantita: qta,
        prezzo_unitario: prezzo,
        importo: importo || qta * prezzo,
        confidence: 0.9,
        warnings: [],
      });
    }
  }

  // Group by capitolo
  const capMap = new Map<string, VoceEstratta[]>();
  for (const v of voci) {
    const key = `${v.capitolo_numero}-${v.capitolo_nome}`;
    if (!capMap.has(key)) capMap.set(key, []);
    capMap.get(key)!.push(v);
  }

  const capitoli = [...capMap.entries()].map(([_, capVoci]) => ({
    numero: capVoci[0].capitolo_numero,
    nome: capVoci[0].capitolo_nome,
    totale: capVoci.reduce((s, v) => s + v.importo, 0),
    voci: capVoci,
  }));

  return {
    metadata: { oggetto_lavori: workbook.SheetNames[0] },
    capitoli: capitoli.length > 0 ? capitoli : [{ numero: 1, nome: "Generale", totale: voci.reduce((s, v) => s + v.importo, 0), voci }],
  };
}

function parseItalianNumber(val: any): number {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const s = String(val).trim();
  const cleaned = s.replace(/\./g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ── Strategy 4: XPWE ────────────────────────────────────────────────────────

async function extractFromXPWE(buffer: ArrayBuffer): Promise<ExtractionResult> {
  const xml = new TextDecoder().decode(buffer);

  const getTag = (str: string, tag: string): string => {
    const match = str.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, "i"));
    return match ? match[1].trim() : "";
  };

  const getAllBlocks = (str: string, tag: string): string[] => {
    const matches = [...str.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))];
    return matches.map((m) => m[0]);
  };

  // Extract metadata
  const datiGenerali = getAllBlocks(xml, "PweDatiGenerali")[0] || "";
  const metadata: ExtractionResult["metadata"] = {
    oggetto_lavori: getTag(datiGenerali, "Oggetto") || getTag(datiGenerali, "DenLavoro"),
    committente: getTag(datiGenerali, "Committente"),
    progettista: getTag(datiGenerali, "Progettista"),
  };

  // Try capitoli structure first
  const capitoliBlocks = getAllBlocks(xml, "PweCapitolo");
  if (capitoliBlocks.length > 0) {
    const capitoli = capitoliBlocks.map((capBlock, i) => {
      const misBlocks = getAllBlocks(capBlock, "PweMisurazione");
      const capVoci = misBlocks.map((misBlock, idx) => {
        const qta = parseItalianNumber(getTag(misBlock, "Quantita") || getTag(misBlock, "Quantità"));
        const prezzo = parseItalianNumber(getTag(misBlock, "Prezzo") || getTag(misBlock, "PrezzoUnitario"));
        const imp = parseItalianNumber(getTag(misBlock, "Importo"));
        return {
          capitolo_numero: i + 1,
          capitolo_nome: getTag(capBlock, "Descrizione") || `Capitolo ${i + 1}`,
          codice_voce: getTag(misBlock, "Codice") || String(idx + 1),
          codice_prezzario: getTag(misBlock, "CodicePrezzario") || getTag(misBlock, "Codice") || "",
          descrizione_breve: (getTag(misBlock, "Descrizione") || getTag(misBlock, "DesBreve")).substring(0, 100),
          descrizione_estesa: getTag(misBlock, "Descrizione") || getTag(misBlock, "DesEstesa") || "",
          unita_misura: getTag(misBlock, "UnitaMisura") || getTag(misBlock, "UnitaDiMisura") || "",
          quantita: qta,
          prezzo_unitario: prezzo,
          importo: (qta && prezzo) ? qta * prezzo : imp,
          confidence: 0.98,
          warnings: [] as string[],
        };
      });
      return {
        numero: i + 1,
        nome: getTag(capBlock, "Descrizione") || `Capitolo ${i + 1}`,
        totale: capVoci.reduce((s, v) => s + v.importo, 0),
        voci: capVoci,
      };
    });
    return { metadata, capitoli };
  }

  // Flat structure: all misurazioni at root level
  const misBlocks = getAllBlocks(xml, "PweMisurazione");
  const voci: VoceEstratta[] = misBlocks.map((misBlock, idx) => {
    const qta = parseItalianNumber(getTag(misBlock, "Quantita") || getTag(misBlock, "Quantità"));
    const prezzo = parseItalianNumber(getTag(misBlock, "Prezzo") || getTag(misBlock, "PrezzoUnitario"));
    const imp = parseItalianNumber(getTag(misBlock, "Importo"));
    return {
      capitolo_numero: 1,
      capitolo_nome: getTag(misBlock, "Categoria") || "Generale",
      codice_voce: getTag(misBlock, "Codice") || String(idx + 1),
      codice_prezzario: getTag(misBlock, "CodicePrezzario") || "",
      descrizione_breve: (getTag(misBlock, "Descrizione") || getTag(misBlock, "DesBreve")).substring(0, 100),
      descrizione_estesa: getTag(misBlock, "Descrizione") || "",
      unita_misura: getTag(misBlock, "UnitaMisura") || "",
      quantita: qta,
      prezzo_unitario: prezzo,
      importo: (qta && prezzo) ? qta * prezzo : imp,
      confidence: 0.98,
      warnings: [],
    };
  });

  // Group by capitolo_nome
  const capMap = new Map<string, VoceEstratta[]>();
  for (const v of voci) {
    if (!capMap.has(v.capitolo_nome)) capMap.set(v.capitolo_nome, []);
    capMap.get(v.capitolo_nome)!.push(v);
  }
  const capitoli = [...capMap.entries()].map(([nome, capVoci], i) => ({
    numero: i + 1,
    nome,
    totale: capVoci.reduce((s, v) => s + v.importo, 0),
    voci: capVoci,
  }));

  return { metadata, capitoli };
}

// ── Validazione ──────────────────────────────────────────────────────────────

const VALID_UM = [
  "mq", "mc", "ml", "m", "m2", "m3", "kg", "cad", "nr", "lt", "q", "t",
  "h", "gg", "km", "a corpo", "corpo", "pz", "cf", "rotolo", "sacchi",
];

function validateExtraction(result: ExtractionResult): {
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!result.capitoli || result.capitoli.length === 0) {
    errors.push("Nessun capitolo o voce estratta dal documento");
    return { warnings, errors };
  }

  const totalVoci = result.capitoli.reduce((s, c) => s + c.voci.length, 0);
  if (totalVoci === 0) {
    errors.push("Nessuna voce di lavorazione estratta");
    return { warnings, errors };
  }

  for (const cap of result.capitoli) {
    const sumVoci = cap.voci.reduce((s, v) => s + (v.importo || 0), 0);
    if (cap.totale && Math.abs(sumVoci - cap.totale) / Math.max(cap.totale, 1) > 0.01) {
      warnings.push(
        `Cap. ${cap.numero}: somma voci (${sumVoci.toFixed(2)}) != totale (${cap.totale.toFixed(2)})`
      );
    }

    for (const voce of cap.voci) {
      if (voce.quantita && voce.prezzo_unitario) {
        const expected = voce.quantita * voce.prezzo_unitario;
        if (Math.abs(expected - voce.importo) > 0.50) {
          voce.warnings = voce.warnings || [];
          voce.warnings.push("Importo non corrisponde a QTA x Prezzo");
          voce.confidence = Math.min(voce.confidence, 0.7);
        }
      }
      if (voce.unita_misura && !VALID_UM.includes(voce.unita_misura.toLowerCase())) {
        voce.warnings = voce.warnings || [];
        voce.warnings.push(`U.M. non standard: ${voce.unita_misura}`);
      }
    }
  }

  return { warnings, errors };
}

function calculateOverallConfidence(result: ExtractionResult): number {
  const allVoci = result.capitoli.flatMap((c) => c.voci);
  if (allVoci.length === 0) return 0;
  return allVoci.reduce((s, v) => s + (v.confidence || 0.5), 0) / allVoci.length;
}

// ── Save extracted voci (batch insert) ───────────────────────────────────────

async function saveExtractedVoci(
  computoId: string,
  companyId: string,
  result: ExtractionResult
) {
  // Delete any previous extraction for this upload
  await sb.from("computo_voci_estratte").delete().eq("computo_upload_id", computoId);

  const rows: any[] = [];
  let ordine = 0;

  for (const cap of result.capitoli) {
    for (const voce of cap.voci) {
      ordine++;
      rows.push({
        computo_upload_id: computoId,
        company_id: companyId,
        capitolo_numero: voce.capitolo_numero || cap.numero,
        capitolo_nome: voce.capitolo_nome || cap.nome,
        codice_voce: voce.codice_voce || "",
        codice_prezzario: voce.codice_prezzario || "",
        descrizione_breve: voce.descrizione_breve || voce.descrizione_estesa?.substring(0, 100) || "Voce senza descrizione",
        descrizione_estesa: voce.descrizione_estesa || "",
        unita_misura: voce.unita_misura || "",
        quantita: voce.quantita || 0,
        prezzo_unitario_computo: voce.prezzo_unitario || 0,
        importo_computo: voce.importo || 0,
        confidence: Math.min(voce.confidence || 0.5, 1.0),
        warnings: voce.warnings || [],
        ordine,
        is_included: true,
      });
    }
  }

  // Batch insert in chunks of 100
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await sb.from("computo_voci_estratte").insert(chunk);
    if (error) console.error("saveExtractedVoci batch error:", error.message);
  }
}

// ── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // Auth validation
    const { userId } = await requireAuth(req, cors);

    const { computoUploadId } = await req.json();
    if (!computoUploadId) {
      return errorResponse("computoUploadId required", 400, cors);
    }

    // 1. Get upload record
    const { data: upload, error: uploadErr } = await sb
      .from("computo_uploads")
      .select("*")
      .eq("id", computoUploadId)
      .single();

    if (uploadErr || !upload) {
      return errorResponse("Upload not found", 404, cors);
    }

    // 2. File size guard (max 50MB in memory)
    if (upload.file_size > 50 * 1024 * 1024) {
      await updateStatus(computoUploadId, "failed", {
        extraction_error: "File troppo grande (max 50MB)",
      });
      return errorResponse("File troppo grande", 413, cors);
    }

    // 3. Update status
    await updateStatus(computoUploadId, "extracting_text");

    // 4. Download file from storage
    const { data: file, error: dlErr } = await sb.storage
      .from("computi")
      .download(upload.storage_path);

    if (dlErr || !file) {
      await updateStatus(computoUploadId, "failed", {
        extraction_error: `Download failed: ${dlErr?.message || "file not found"}`,
      });
      return errorResponse("File download failed", 500, cors);
    }

    const buffer = await file.arrayBuffer();

    // 5. Choose extraction strategy
    let result: ExtractionResult;
    let method: string;

    try {
      const fileType = upload.file_type as string;

      if (fileType === "xlsx" || fileType === "xls") {
        result = await extractFromExcel(buffer);
        method = "xlsx_parse";
      } else if (fileType === "xpwe" || fileType === "dcf") {
        result = await extractFromXPWE(buffer);
        method = "xpwe_parse";
      } else {
        // PDF or image - try text extraction first
        const text = await extractTextFromPDF(buffer);
        if (text.trim().length > 200) {
          await updateStatus(computoUploadId, "analyzing_ai");
          result = await analyzeWithAI(text, computoUploadId);
          method = "pdf_text";
        } else {
          // Low text content - try Vision-based approach
          result = await extractFromPDFVision(buffer, computoUploadId);
          method = "pdf_vision";
        }
      }
    } catch (err: any) {
      await updateStatus(computoUploadId, "failed", {
        extraction_error: `Extraction error: ${err.message}`,
      });
      return errorResponse(err.message, 500, cors);
    }

    // 6. Validate
    await updateStatus(computoUploadId, "validating");
    const validation = validateExtraction(result);

    if (validation.errors.length > 0) {
      await updateStatus(computoUploadId, "failed", {
        extraction_error: validation.errors.join("; "),
      });
      return errorResponse(validation.errors.join("; "), 422, cors);
    }

    // 7. Save extracted voci
    await saveExtractedVoci(computoUploadId, upload.company_id, result);

    // 8. Update upload with metadata
    await sb
      .from("computo_uploads")
      .update({
        extraction_status: "review",
        extraction_method: method,
        raw_extracted_json: result,
        extraction_confidence: calculateOverallConfidence(result),
        extraction_completed_at: new Date().toISOString(),
        oggetto_lavori: result.metadata?.oggetto_lavori || null,
        committente: result.metadata?.committente || null,
        progettista: result.metadata?.progettista || null,
        data_computo: result.metadata?.data_computo || null,
      })
      .eq("id", computoUploadId);

    return jsonResponse({
      success: true,
      method,
      voci_count: result.capitoli.reduce((s, c) => s + c.voci.length, 0),
      capitoli_count: result.capitoli.length,
      confidence: calculateOverallConfidence(result),
      warnings: validation.warnings,
    }, 200, cors);
  } catch (err: any) {
    // requireAuth throws a Response on 401
    if (err instanceof Response) return err;
    console.error("computo-ai-extract error:", err);
    return errorResponse(err.message, 500, getCorsHeaders(req));
  }
});
