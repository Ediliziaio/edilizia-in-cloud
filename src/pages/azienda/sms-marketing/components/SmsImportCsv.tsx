/**
 * Componente drag & drop per l'importazione di contatti SMS da CSV.
 * Valida il formato E.164 lato client prima dell'import.
 */
import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useSmsContatti } from "@/hooks/useSmsContatti";

interface ImportResult {
  importati: number;
  errori: number;
}

export function SmsImportCsv() {
  const [isDragging, setIsDragging] = useState(false);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [previewHeader, setPreviewHeader] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { importCsv, isImporting } = useSmsContatti();

  const parsePreview = (text: string) => {
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return;
    const header = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
    const rows = lines.slice(1, 11).map((l) =>
      l.split(",").map((c) => c.trim().replace(/"/g, ""))
    );
    setPreviewHeader(header);
    setPreviewRows(rows);
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setResult(null);
    const text = await f.text();
    parsePreview(text);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".csv")) handleFile(f);
  };

  const handleImport = async () => {
    if (!file) return;
    const res = await importCsv(file);
    setResult(res);
    setFile(null);
    setPreviewRows([]);
    setPreviewHeader([]);
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
        )}
      >
        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-medium">Trascina qui il file CSV o clicca per selezionarlo</p>
        <p className="text-xs text-muted-foreground mt-1">Colonne attese: telefono, nome, cognome, consenso</p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {/* File selezionato */}
      {file && (
        <div className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{file.name}</span>
          <span className="text-muted-foreground">({Math.round(file.size / 1024)} KB)</span>
        </div>
      )}

      {/* Preview */}
      {previewRows.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Anteprima prime {previewRows.length} righe
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    {previewHeader.map((h) => (
                      <th key={h} className="px-2 py-1 text-left font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {row.map((cell, j) => (
                        <td key={j} className="px-2 py-1">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {isImporting && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Importazione in corso...
          </div>
          <Progress value={undefined} className="h-1" />
        </div>
      )}

      {/* Risultato */}
      {result && (
        <div className={cn(
          "flex items-center gap-2 p-3 rounded-lg text-sm",
          result.errori === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
        )}>
          {result.errori === 0
            ? <CheckCircle2 className="h-4 w-4 shrink-0" />
            : <AlertCircle className="h-4 w-4 shrink-0" />
          }
          <span>
            Import completato: <strong>{result.importati.toLocaleString("it-IT")}</strong> importati,{" "}
            <strong>{result.errori.toLocaleString("it-IT")}</strong> errori
          </span>
        </div>
      )}

      {/* Azione */}
      {file && !isImporting && (
        <Button onClick={handleImport} disabled={isImporting}>
          <Upload className="h-4 w-4 mr-2" />
          Avvia importazione
        </Button>
      )}
    </div>
  );
}
