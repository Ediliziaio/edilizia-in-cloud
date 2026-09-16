/**
 * Documenti scelti mentre si crea la commessa: salgono quando la commessa
 * nasce. Ogni file ha già la sua cartella (proposta dal nome, correggibile).
 */
import { useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Paperclip, Upload, X, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useCartelleDocumenti } from "@/hooks/useCartelleDocumenti";
import {
  ACCEPT_INPUT,
  MAX_MB_PER_FILE,
  cartellaDelFileInCoda,
  cartellaSuggerita,
  problemaFile,
} from "@/lib/commesse/documentiCommessa";
import { fmtBytes } from "./filePreviewUtils";

export interface PendingFile {
  file: File;
  visibleToCustomer: boolean;
  /** undefined = nessuna scelta: vale la cartella proposta dal nome del file. */
  folderId?: string | null;
}

interface PendingFilesUploadProps {
  files: PendingFile[];
  onFilesChange: (files: PendingFile[]) => void;
}

export function PendingFilesUpload({ files, onFilesChange }: PendingFilesUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const { cartelle } = useCartelleDocumenti();

  const validateAndAddFiles = useCallback((selected: File[]) => {
    const valid: PendingFile[] = [];
    for (const file of selected) {
      const problema = problemaFile(file);
      if (problema) {
        toast.error("File escluso", { description: problema });
        continue;
      }
      if (files.some((p) => p.file.name === file.name && p.file.size === file.size)) continue;
      const folderId = cartellaSuggerita(file.name, cartelle);
      valid.push({
        file,
        folderId,
        visibleToCustomer: cartelle.find((c) => c.id === folderId)?.visibile_cliente ?? false,
      });
    }
    if (valid.length > 0) onFilesChange([...files, ...valid]);
  }, [files, onFilesChange, cartelle]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items?.length) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false); dragCounter.current = 0;
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) validateAndAddFiles(droppedFiles);
  };

  const aggiorna = (index: number, patch: Partial<PendingFile>) =>
    onFilesChange(files.map((pf, i) => (i === index ? { ...pf, ...patch } : pf)));

  return (
    <Card
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative transition-colors ${isDragging ? "border-dashed border-2 border-primary/50 bg-primary/5" : ""}`}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Paperclip className="h-5 w-5" />
          Documenti commessa
        </CardTitle>
        <div>
          <input
            ref={fileInputRef}
            id="documenti-nuova-commessa"
            type="file"
            multiple
            onChange={(e) => {
              validateAndAddFiles(Array.from(e.target.files || []));
              e.target.value = "";
            }}
            className="hidden"
            accept={ACCEPT_INPUT}
          />
          <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Carica file
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isDragging && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-primary/5 border-2 border-dashed border-primary/50 pointer-events-none">
            <Upload className="h-10 w-10 text-primary/60 mb-2" />
            <p className="text-sm font-medium text-primary/70">Trascina i file qui</p>
          </div>
        )}

        {files.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            Nessun documento. Scegli o trascina qui i file: puoi selezionarne tanti insieme.
          </p>
        ) : (
          <div className="space-y-2">
            {files.map((pf, index) => {
              const cartella = cartellaDelFileInCoda(pf, cartelle);
              return (
                <div
                  key={`${pf.file.name}-${pf.file.size}-${index}`}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-lg border bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block" title={pf.file.name}>{pf.file.name}</span>
                    <span className="text-xs text-muted-foreground">{fmtBytes(pf.file.size)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {cartelle.length > 0 && (
                      <Select
                        value={cartella ?? ""}
                        onValueChange={(id) => {
                          aggiorna(index, {
                            folderId: id,
                            visibleToCustomer: cartelle.find((c) => c.id === id)?.visibile_cliente ?? pf.visibleToCustomer,
                          });
                        }}
                      >
                        <SelectTrigger className={`h-8 w-full sm:w-[220px] text-xs ${cartella ? "" : "text-muted-foreground"}`}>
                          <SelectValue placeholder="Scegli la cartella" />
                        </SelectTrigger>
                        <SelectContent>
                          {cartelle.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0" title="Visibile al cliente nella sua area">
                      {pf.visibleToCustomer ? <Eye className="h-3.5 w-3.5 text-emerald-600" /> : <EyeOff className="h-3.5 w-3.5" />}
                      Cliente
                      <Switch
                        checked={pf.visibleToCustomer}
                        onCheckedChange={(v) => aggiorna(index, { visibleToCustomer: v })}
                        aria-label="Visibile al cliente"
                      />
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive shrink-0"
                      onClick={() => onFilesChange(files.filter((_, i) => i !== index))}
                      aria-label={`Togli ${pf.file.name}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground text-center pt-1">
              {files.length} file · massimo {MAX_MB_PER_FILE} MB ciascuno · le foto pesanti vengono ridotte · salgono quando crei la commessa
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
