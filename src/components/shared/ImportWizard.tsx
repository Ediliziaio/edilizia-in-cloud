import { useState, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";
import { Button } from "@/components/ui/button";
import { ChevronLeft, X } from "lucide-react";
import { StepIndicator } from "./import-wizard/StepIndicator";
import { StepStart, type ObjectType } from "./import-wizard/StepStart";
import { StepUpload, type ImportMode } from "./import-wizard/StepUpload";
import { StepMap } from "./import-wizard/StepMap";
import { StepReview } from "./import-wizard/StepReview";
import type { AnteprimaImport, AutomazioneScelta, EsitoImportazione, OpzioniImport, PersonaScelta } from "@/lib/importazione/tipi";
import { supabase } from "@/integrations/supabase/client";
import { annullaImportazione, testoAnnullamento } from "@/lib/importazione/registro";
import { applicaColonneRicordate, caricaColonne, salvaColonne } from "@/lib/importazione/colonneRicordate";
import { programmazioneValida, type Programmazione } from "@/lib/importazione/programmata";
import { scaricaRigheDaRivedere } from "./import-wizard/scaricaRighe";
import { PAGINA_IMPORTAZIONE } from "./import-wizard/useImportaDaUrl";
import { campiObbligatoriMancanti, type ImportField } from "./CSVImportDialog";

export interface ImportWizardProps {
  open: boolean;
  onClose: () => void;
  defaultObjectType: ObjectType;
  /** Dove finiranno le righe, se non è ovvio: lo si vede in ogni passo. */
  destinazione?: string;
  contactFields: ImportField[];
  opportunityFields: ImportField[];
  onImportContacts: (rows: Record<string, string>[], options: OpzioniImport) => Promise<EsitoImportazione>;
  onImportOpportunities: (rows: Record<string, string>[], options: OpzioniImport) => Promise<EsitoImportazione>;
  /** Al passo 4 si scelgono etichette, automazioni e quando importare. */
  conOpzioni?: boolean;
  /** Cosa succederà premendo «Importa», calcolato prima. */
  onAnteprima?: (rows: Record<string, string>[], options: OpzioniImport) => Promise<AnteprimaImport>;
  /** L'azienda: serve a ricordare come sono state collegate le colonne l'ultima volta. */
  companyId?: string;
  /** Dopo un annullamento: la pagina ricarica i suoi elenchi. */
  onAnnullata?: () => void;
}

export type { OpzioniImport, EsitoImportazione, AnteprimaImport } from "@/lib/importazione/tipi";

function autoMatch(fileHeaders: string[], fields: ImportField[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9àèéìòù]/g, "");
  fileHeaders.forEach((header) => {
    const norm = normalize(header);
    const match = fields.find((f) => {
      const ln = normalize(f.label);
      const kn = normalize(f.key);
      return norm === ln || norm === kn || ln.includes(norm) || norm.includes(ln);
    });
    if (match) mapping[header] = match.key;
  });
  return mapping;
}

/** Le righe del file e, per ognuna, il suo numero vero nel file (le righe vuote si saltano ma contano). */
function parseFileData(file: File): Promise<{ headers: string[]; rows: string[][]; numeri: number[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isCSV = file.name.toLowerCase().endsWith(".csv");
    if (isCSV) {
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (!text) return reject(new Error("File vuoto"));
        const firstLine = text.split("\n")[0];
        const sep = firstLine.includes(";") ? ";" : ",";
        const tutte = text.split("\n").map((l, i) => ({ l: l.trim(), n: i + 1 }));
        const lines = tutte.filter((x) => x.l).map((x) => x.l);
        const numeri = tutte.filter((x) => x.l).map((x) => x.n).slice(1);
        const parseRow = (line: string) => {
          const result: string[] = [];
          let inQuote = false, current = "";
          for (const ch of line) {
            if (ch === '"') { inQuote = !inQuote; continue; }
            if (ch === sep && !inQuote) { result.push(current.trim()); current = ""; continue; }
            current += ch;
          }
          result.push(current.trim());
          return result;
        };
        resolve({ headers: parseRow(lines[0]), rows: lines.slice(1).map(parseRow), numeri });
      };
      reader.onerror = () => reject(new Error("Errore lettura file"));
      reader.readAsText(file);
    } else {
      (async () => {
        try {
          const ExcelJS = (await import("exceljs")).default;
          const wb = new ExcelJS.Workbook();
          const arrayBuffer = await file.arrayBuffer();
          await wb.xlsx.load(arrayBuffer);
          const ws = wb.worksheets[0];
          if (!ws) return reject(new Error("File vuoto"));
          const headers: string[] = [];
          ws.getRow(1).eachCell({ includeEmpty: true }, (cell) => { headers.push(String(cell.value ?? "")); });
          if (headers.length === 0) return reject(new Error("File vuoto"));
          const rows: string[][] = [];
          const numeri: number[] = [];
          ws.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            numeri.push(rowNumber);
            const r: string[] = [];
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
              while (r.length < colNumber - 1) r.push("");
              r.push(cell.value != null ? String(cell.value) : "");
            });
            rows.push(r);
          });
          resolve({ headers, rows, numeri });
        } catch (e) {
          reject(e instanceof Error ? e : new Error("Errore lettura file"));
        }
      })();
    }
  });
}

export function ImportWizard({
  open, onClose, defaultObjectType, contactFields, opportunityFields,
  onImportContacts, onImportOpportunities, destinazione, conOpzioni, onAnteprima, companyId, onAnnullata,
}: ImportWizardProps) {
  const [step, setStep] = useState(0);
  const [objectType, setObjectType] = useState<ObjectType>(defaultObjectType);
  const [file, setFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("create");
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<string[][]>([]);
  const [fileNumeri, setFileNumeri] = useState<number[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [skipUnmapped, setSkipUnmapped] = useState(true);
  const [consent, setConsent] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<EsitoImportazione | null>(null);
  const [etichette, setEtichette] = useState<string[]>([]);
  const [automazioni, setAutomazioni] = useState<AutomazioneScelta[]>([]);
  const [assegnatari, setAssegnatari] = useState<PersonaScelta[]>([]);
  // L'ultimo file scelto: le colonne ricordate di un file precedente, arrivate tardi, non lo sovrascrivono.
  const fileCorrente = useRef<File | null>(null);
  const queryClient = useQueryClient();
  const [programmazione, setProgrammazione] = useState<Programmazione | null>(null);
  const [anteprima, setAnteprima] = useState<{ dati: AnteprimaImport | null; errore: boolean } | null>(null);

  const navigate = useNavigate();
  const prefissoMarketing = useMarketingRoutePrefix();
  const fields = objectType === "contacts" ? contactFields : opportunityFields;

  // Ogni pagina conosce solo i campi del suo oggetto: per l'altro si va alla sua
  // importazione, dove ci sono i suoi campi, personalizzati compresi.
  const scegliOggetto = (tipo: ObjectType) => {
    const campi = tipo === "contacts" ? contactFields : opportunityFields;
    if (campi.length > 0) setObjectType(tipo);
    else navigate(`${prefissoMarketing}/${PAGINA_IMPORTAZIONE[tipo]}`);
  };

  const handleFileChange = useCallback(async (f: File | null) => {
    setFile(f);
    fileCorrente.current = f;
    if (!f) { setFileHeaders([]); setFileRows([]); setFileNumeri([]); setMapping({}); return; }
    try {
      const { headers, rows, numeri } = await parseFileData(f);
      setFileHeaders(headers);
      setFileRows(rows);
      setFileNumeri(numeri);
      const automatico = autoMatch(headers, fields);
      setMapping(automatico);
      // Le colonne come l'azienda le ha collegate l'ultima volta vincono su quelle indovinate.
      if (companyId) {
        const ricordate = await caricaColonne(supabase, companyId, objectType === "contacts" ? "contatti" : "opportunita");
        if (fileCorrente.current !== f) return;
        // Solo se nel frattempo nessuno ha toccato il collegamento a mano.
        setMapping((attuale) => (attuale === automatico ? applicaColonneRicordate(headers, automatico, ricordate, fields.map((c) => c.key)) : attuale));
      }
    } catch {
      setFile(null);
    }
  }, [fields, companyId, objectType]);

  const missingRequired = useMemo(() => {
    return campiObbligatoriMancanti(fields, mapping);
  }, [mapping, fields]);

  const canNext = (s: number) => {
    if (s === 1) return !!file && fileHeaders.length > 0;
    if (s === 2) return missingRequired.length === 0 && fileRows.length > 0;
    if (s === 3) return consent && !isImporting && (!programmazione || programmazioneValida(programmazione));
    return true;
  };

  // Ogni riga porta il suo numero nel file (l'intestazione è la riga 1): gli avvisi e le righe
  // da scaricare devono parlare delle righe che l'utente vede nel suo file.
  const righeMappate = useCallback(() => fileRows.map((row, n) => {
    const obj: Record<string, string> = {};
    fileHeaders.forEach((header, idx) => {
      const fieldKey = mapping[header];
      if (fieldKey) obj[fieldKey] = row[idx] || "";
    });
    return { obj, riga: fileNumeri[n] ?? n + 2 };
  }).filter(({ obj }) => Object.values(obj).some((v) => v.trim()))
    .map(({ obj, riga }) => ({ ...obj, __riga: String(riga) })), [fileRows, fileNumeri, fileHeaders, mapping]);

  const opzioniCorrenti = (): OpzioniImport => ({
    mode: importMode, etichette, automazioni, assegnatari, programmazione, nomeFile: file?.name,
  });

  const calcolaAnteprima = useCallback(async () => {
    if (!onAnteprima) return;
    setAnteprima({ dati: null, errore: false });
    try {
      setAnteprima({ dati: await onAnteprima(righeMappate(), { mode: importMode }), errore: false });
    } catch {
      setAnteprima({ dati: null, errore: true });
    }
  }, [onAnteprima, righeMappate, importMode]);

  const handleImport = useCallback(async () => {
    setIsImporting(true);
    const mappedRows = righeMappate();
    if (companyId) void salvaColonne(supabase, companyId, objectType === "contacts" ? "contatti" : "opportunita", fileHeaders, mapping);

    try {
      const res = objectType === "contacts"
        ? await onImportContacts(mappedRows, opzioniCorrenti())
        : await onImportOpportunities(mappedRows, opzioniCorrenti());
      setResult(res);
    } catch (err: any) {
      setResult({ success: 0, errors: [err?.message || "Errore durante l'importazione"] });
    } finally {
      setIsImporting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [righeMappate, objectType, importMode, etichette, automazioni, assegnatari, programmazione, file, onImportContacts, onImportOpportunities, companyId, fileHeaders, mapping]);

  const handleNext = () => {
    if (step === 3) { handleImport(); return; }
    if (step === 2) void calcolaAnteprima();
    setStep((s) => s + 1);
  };

  if (!open) return null;

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)] -m-6 bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-background shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Importazioni</h1>
          <p className="text-sm text-muted-foreground">{destinazione || "Importare contatti e lead"}</p>
        </div>
        <button type="button" aria-label="Chiudi importazione" onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Stepper */}
      <div className="shrink-0 border-b bg-background">
        <StepIndicator currentStep={result ? 4 : step} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-8 transition-opacity duration-200">
        {step === 0 && <StepStart objectType={objectType} onObjectTypeChange={scegliOggetto} />}
        {step === 1 && (
          <StepUpload
            objectType={objectType}
            file={file}
            onFileChange={handleFileChange}
            importMode={importMode}
            onImportModeChange={setImportMode}
          />
        )}
        {step === 2 && (
          <StepMap
            objectType={objectType}
            fields={fields}
            fileHeaders={fileHeaders}
            fileRows={fileRows}
            mapping={mapping}
            onMappingChange={setMapping}
            skipUnmapped={skipUnmapped}
            onSkipUnmappedChange={setSkipUnmapped}
          />
        )}
        {step === 3 && (
          <StepReview
            objectType={objectType}
            fields={fields}
            fileHeaders={fileHeaders}
            fileRows={fileRows}
            mapping={mapping}
            fileName={file?.name || ""}
            fileSize={file?.size || 0}
            importMode={importMode}
            consent={consent}
            onConsentChange={setConsent}
            isImporting={isImporting}
            result={result}
            opzioni={conOpzioni
              ? {
                etichette, onEtichetteChange: setEtichette, automazioni, onAutomazioniChange: setAutomazioni,
                programmazione, onProgrammazioneChange: setProgrammazione, assegnatari, onAssegnatariChange: setAssegnatari,
              }
              : undefined}
            onAnnulla={result?.importazioneId
              ? async () => {
                const testo = testoAnnullamento(await annullaImportazione(supabase, result.importazioneId!));
                queryClient.invalidateQueries({ queryKey: ["importazione-ultima"] });
                queryClient.invalidateQueries({ queryKey: ["importazioni-programmate"] });
                onAnnullata?.();
                return testo;
              }
              : undefined}
            anteprima={anteprima}
            onRiprovaAnteprima={calcolaAnteprima}
            onScaricaRighe={result?.righeDaRivedere?.length
              ? () => scaricaRigheDaRivedere(file?.name ?? "importazione", fileHeaders, fileRows, result.righeDaRivedere!, fileNumeri)
              : undefined}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-3 border-t bg-background shrink-0">
        <div>
          {step > 0 && !result && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={isImporting}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Indietro
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!result && (
            <Button variant="ghost" onClick={onClose} disabled={isImporting}>
              Annulla
            </Button>
          )}
          {result ? (
            <Button onClick={onClose}>Chiudi</Button>
          ) : (
            <Button onClick={handleNext} disabled={!canNext(step) || isImporting}>
              {step === 3 ? (programmazione ? "Programma l'importazione" : "Importa adesso") : "Successivo"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
