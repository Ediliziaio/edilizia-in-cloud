import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Tipi principali ──────────────────────────────────────

/** Riga CSV grezza: chiavi = header CSV, valori = stringhe */
export interface CsvRow {
  [key: string]: string;
}

/** Mappatura colonne CSV verso campi target */
export interface ColumnMapping {
  ragione_sociale?: string;
  piva?: string;
  email?: string;
  telefono?: string;
  regione?: string;
  comune?: string;
  settore?: string;
  dimensione?: string;
}

/** Errore di validazione su una riga CSV */
export interface ImportError {
  row: number;
  field: string;
  value: string;
  message: string;
}

/** Risultato parsing CSV client-side */
export interface ParsedCsvData {
  headers: string[];
  rows: CsvRow[];
  totalRows: number;
}

/** Record job di import nel DB */
export interface CsvImportJob {
  id: string;
  filename: string;
  status: "pending" | "processing" | "completed" | "failed";
  total_rows: number;
  imported_rows: number;
  failed_rows: number;
  error_log: ImportError[];
  column_mapping: ColumnMapping;
  source: string | null;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
}

// ─── Chiave query ─────────────────────────────────────────

const IMPORT_JOBS_KEY = ["csv-import-jobs"] as const;

// ─── Funzioni di utilità (esportate per riuso nei componenti) ─

/**
 * Parsa un testo CSV in headers + righe.
 * Gestisce valori tra virgolette e rimuove virgolette doppie.
 */
export function parseCsv(text: string): ParsedCsvData {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [], totalRows: 0 };

  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, ""));

  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: CsvRow = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row;
  });

  return { headers, rows, totalRows: rows.length };
}

/**
 * Valida una Partita IVA italiana (11 cifre + algoritmo di controllo).
 * Restituisce true se valida.
 */
export function validatePIVA(piva: string): boolean {
  const p = piva.replace(/\D/g, "");
  if (p.length !== 11) return false;

  let s = 0;
  // Somma cifre in posizione pari (0-indexed)
  for (let i = 0; i <= 9; i += 2) s += parseInt(p[i]);
  // Somma cifre in posizione dispari con raddoppio
  for (let i = 1; i <= 9; i += 2) {
    let d = parseInt(p[i]) * 2;
    if (d > 9) d -= 9;
    s += d;
  }

  return (10 - (s % 10)) % 10 === parseInt(p[10]);
}

/** Valida un indirizzo email con regex semplice */
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Normalizza un numero di telefono italiano.
 * Aggiunge il prefisso +39 se necessario.
 */
export function normalizeTelefono(tel: string): string {
  const digits = tel.replace(/\D/g, "");
  if (digits.startsWith("39")) return "+" + digits;
  if (!digits.startsWith("0") && digits.length <= 10) return "+39" + digits;
  return digits;
}

// ─── Utility: normalizza riga grezza dal DB ───────────────

function normalizeJob(raw: Record<string, unknown>): CsvImportJob {
  const rawErrors = raw.error_log;
  const error_log: ImportError[] = Array.isArray(rawErrors)
    ? (rawErrors as ImportError[])
    : [];

  const rawMapping = raw.column_mapping;
  const column_mapping: ColumnMapping =
    rawMapping !== null && typeof rawMapping === "object" && !Array.isArray(rawMapping)
      ? (rawMapping as ColumnMapping)
      : {};

  return {
    id: raw.id as string,
    filename: raw.filename as string,
    status: raw.status as CsvImportJob["status"],
    total_rows: (raw.total_rows as number) ?? 0,
    imported_rows: (raw.imported_rows as number) ?? 0,
    failed_rows: (raw.failed_rows as number) ?? 0,
    error_log,
    column_mapping,
    source: (raw.source as string | null) ?? null,
    notes: (raw.notes as string | null) ?? null,
    created_at: raw.created_at as string,
    completed_at: (raw.completed_at as string | null) ?? null,
  };
}

// ─── Lista job recenti ────────────────────────────────────

/** Carica gli ultimi 20 job di import CSV */
export function useCsvImportJobs() {
  return useQuery({
    queryKey: IMPORT_JOBS_KEY,
    queryFn: async (): Promise<CsvImportJob[]> => {
      const { data, error } = await supabase
        .from("csv_import_jobs")
        .select(
          "id, filename, status, total_rows, imported_rows, failed_rows, error_log, column_mapping, source, notes, created_at, completed_at"
        )
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw new Error("Impossibile caricare i job di import: " + error.message);

      return (data ?? []).map((row) => normalizeJob(row as Record<string, unknown>));
    },
    staleTime: 60 * 1000, // 1 minuto
  });
}

// ─── Mutation: esegui import ──────────────────────────────

/** Payload per avviare un import CSV */
export interface RunCsvImportPayload {
  filename: string;
  source: string;
  notes: string;
  parsedData: ParsedCsvData;
  mapping: ColumnMapping;
}

/**
 * Mutation che:
 * 1. Crea un record in csv_import_jobs con status "processing"
 * 2. Valida ogni riga e raccoglie gli errori
 * 3. Inserisce i lead validi in `companies` a batch di 50
 * 4. Aggiorna il job con i risultati finali
 */
export function useRunCsvImport() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (
      payload: RunCsvImportPayload
    ): Promise<{ importedRows: number; failedRows: number; errors: ImportError[] }> => {
      const { filename, source, notes, parsedData, mapping } = payload;
      const { rows } = parsedData;

      // 1. Crea il record job
      const { data: jobData, error: jobError } = await supabase
        .from("csv_import_jobs")
        .insert({
          filename,
          status: "processing",
          total_rows: rows.length,
          imported_rows: 0,
          failed_rows: 0,
          error_log: [],
          column_mapping: mapping,
          source: source || null,
          notes: notes || null,
        })
        .select("id")
        .single();

      if (jobError || !jobData) {
        throw new Error("Impossibile creare il job: " + (jobError?.message ?? "errore sconosciuto"));
      }

      const jobId = (jobData as Record<string, unknown>).id as string;

      // 2. Valida e prepara le righe
      const errori: ImportError[] = [];
      const righeValide: Array<{
        name: string;
        email: string;
        sector: string | null;
      }> = [];

      rows.forEach((row, idx) => {
        const rigaNum = idx + 2; // +2 perché la riga 1 è l'header
        let haErrore = false;

        // Valida PIVA se mappata
        if (mapping.piva) {
          const piva = row[mapping.piva] ?? "";
          if (piva && !validatePIVA(piva)) {
            errori.push({
              row: rigaNum,
              field: "piva",
              value: piva,
              message: "P.IVA non valida (deve avere 11 cifre e superare il controllo algoritmico)",
            });
            haErrore = true;
          }
        }

        // Valida email se mappata
        if (mapping.email) {
          const email = row[mapping.email] ?? "";
          if (email && !validateEmail(email)) {
            errori.push({
              row: rigaNum,
              field: "email",
              value: email,
              message: "Email non valida",
            });
            haErrore = true;
          }
        }

        // Richiediamo almeno name o email
        const name = mapping.ragione_sociale ? (row[mapping.ragione_sociale] ?? "") : "";
        const email = mapping.email ? (row[mapping.email] ?? "") : "";

        if (!name && !email) {
          errori.push({
            row: rigaNum,
            field: "ragione_sociale",
            value: "",
            message: "Riga saltata: né ragione sociale né email valorizzati",
          });
          haErrore = true;
        }

        if (!haErrore) {
          const settore = mapping.settore ? (row[mapping.settore] ?? null) : null;
          righeValide.push({
            name: name || email, // fallback su email come nome
            email,
            sector: settore,
          });
        }
      });

      // 3. Inserisce in batch da 50 righe
      let importate = 0;
      const BATCH_SIZE = 50;

      for (let i = 0; i < righeValide.length; i += BATCH_SIZE) {
        const batch = righeValide.slice(i, i + BATCH_SIZE);

        // Costruisce le righe per companies (solo campi che la tabella accetta)
        const righeDb = batch
          .filter((r) => r.email) // email è NOT NULL UNIQUE
          .map((r) => ({
            name: r.name,
            email: r.email,
            ...(r.sector ? { sector: r.sector } : {}),
          }));

        if (righeDb.length === 0) continue;

        const { error: insertError } = await supabase
          .from("companies")
          .upsert(righeDb, { onConflict: "email", ignoreDuplicates: true });

        if (insertError) {
          // Segna tutte le righe del batch come fallite
          batch.forEach((_, batchIdx) => {
            errori.push({
              row: i + batchIdx + 2,
              field: "batch",
              value: "",
              message: "Errore inserimento batch: " + insertError.message,
            });
          });
        } else {
          importate += righeDb.length;
        }
      }

      const righe_fallite = rows.length - importate;

      // 4. Aggiorna il job con i risultati
      await supabase
        .from("csv_import_jobs")
        .update({
          status: "completed",
          imported_rows: importate,
          failed_rows: righe_fallite,
          error_log: errori,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      return { importedRows: importate, failedRows: righe_fallite, errors: errori };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: IMPORT_JOBS_KEY });
    },
    onError: (err: Error) => {
      toast.error("Errore import CSV: " + err.message);
    },
  });
}
