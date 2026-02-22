import { useState, useCallback } from "react";
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.size <= 30 * 1024 * 1024) onFileChange(f);
  }, [onFileChange]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.size <= 30 * 1024 * 1024) onFileChange(f);
    e.target.value = "";
  }, [onFileChange]);

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
        <div
          className={cn(
            "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById("wizard-file-input")?.click()}
        >
          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium mb-1">Trascina qui il file o clicca per selezionare</p>
          <p className="text-sm text-muted-foreground">Formati supportati: .csv, .xls, .xlsx — Max 30MB</p>
          <input
            id="wizard-file-input"
            type="file"
            accept=".csv,.xls,.xlsx"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 border rounded-xl p-4 bg-muted/30">
          <FileSpreadsheet className="h-8 w-8 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
          </div>
          <button type="button" onClick={() => onFileChange(null)} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Import mode */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Seleziona come importare {label}
        </label>
        <Select value={importMode} onValueChange={(v) => onImportModeChange(v as ImportMode)}>
          <SelectTrigger className="w-full">
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
