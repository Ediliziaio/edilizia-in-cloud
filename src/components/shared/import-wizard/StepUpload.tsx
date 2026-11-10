import { useState, useCallback, useId, useRef } from "react";
import { Upload, FileSpreadsheet, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ObjectType } from "./StepStart";

export type ImportMode = "create" | "update" | "upsert";

interface StepUploadProps {
  objectType: ObjectType;
  file: File | null;
  onFileChange: (file: File | null) => void;
  importMode: ImportMode;
  onImportModeChange: (mode: ImportMode) => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StepUpload({ objectType, file, onFileChange, importMode, onImportModeChange }: StepUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const modeId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptFile = useCallback((candidate?: File) => {
    if (!candidate) return;
    if (!/\.(csv|xls|xlsx)$/i.test(candidate.name)) {
      setFileError("Formato non supportato. Scegli un file CSV o Excel (.xls, .xlsx).");
      return;
    }
    if (candidate.size > 30 * 1024 * 1024) {
      setFileError("Il file supera 30 MB. Riduci le dimensioni e riprova.");
      return;
    }
    setFileError(null);
    onFileChange(candidate);
  }, [onFileChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    acceptFile(e.dataTransfer.files[0]);
  }, [acceptFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0]);
    e.target.value = "";
  }, [acceptFile]);

  const label = objectType === "contacts" ? "contatti" : "opportunità";

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Carica i tuoi file</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Carica un file CSV o Excel contenente i tuoi {label}.
        </p>
      </div>

      {/* Drop zone */}
      {!file ? (
        <button
          type="button"
          aria-label="Seleziona un file CSV o Excel"
          className={cn(
            "w-full border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <span className="block font-medium mb-1">Trascina qui il file o clicca per selezionare</span>
          <span className="block text-sm text-muted-foreground">Formati supportati: .csv, .xls, .xlsx — Max 30MB</span>
        </button>
      ) : (
        <div className="flex items-center gap-3 border rounded-xl p-4 bg-muted/30">
          <FileSpreadsheet className="h-8 w-8 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
          </div>
          <button type="button" aria-label="Rimuovi file selezionato" onClick={() => onFileChange(null)} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        aria-label="File da importare"
        accept=".csv,.xls,.xlsx"
        className="hidden"
        onChange={handleFileInput}
      />
      {fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}

      {/* Import mode */}
      <div className="space-y-2">
        <label htmlFor={modeId} className="text-sm font-medium">
          Seleziona come importare {label}
        </label>
        <Select value={importMode} onValueChange={(v) => onImportModeChange(v as ImportMode)}>
          <SelectTrigger id={modeId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="create">Crea {label}</SelectItem>
            <SelectItem value="upsert">Crea e aggiorna {label}</SelectItem>
            <SelectItem value="update">Aggiorna {label}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {importMode === "create" && "Verranno creati solo nuovi record."}
          {importMode === "update" && "Verranno aggiornati solo i record esistenti (corrispondenza per email/telefono)."}
          {importMode === "upsert" && "I record esistenti verranno aggiornati e i nuovi verranno creati."}
        </p>
      </div>
    </div>
  );
}
