import { FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ImportField } from "@/components/shared/CSVImportDialog";
import type { ObjectType } from "./StepStart";
import type { ImportMode } from "./StepUpload";

interface StepReviewProps {
  objectType: ObjectType;
  fields: ImportField[];
  fileHeaders: string[];
  fileRows: string[][];
  mapping: Record<string, string>;
  fileName: string;
  fileSize: number;
  importMode: ImportMode;
  consent: boolean;
  onConsentChange: (v: boolean) => void;
  isImporting: boolean;
  result: { success: number; errors: string[] } | null;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StepReview({
  objectType, fields, fileHeaders, mapping, fileName, fileSize,
  importMode, consent, onConsentChange, isImporting, result, fileRows,
}: StepReviewProps) {
  const mappedEntries = fileHeaders
    .filter((h) => mapping[h])
    .map((h) => ({ header: h, field: fields.find((f) => f.key === mapping[h]) }));

  const label = objectType === "contacts" ? "contatti" : "opportunità";
  const modeLabel = importMode === "create" ? "Crea" : importMode === "update" ? "Aggiorna" : "Crea e aggiorna";

  if (isImporting) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Importazione in corso...</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="max-w-xl mx-auto space-y-4 py-8">
        {result.success > 0 && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 rounded-lg p-4">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="font-medium">{result.success} righe importate con successo</span>
          </div>
        )}
        {result.errors.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{result.errors.length} errori</span>
            </div>
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-1">
                {result.errors.map((err, i) => (
                  <p key={i} className="text-xs text-destructive bg-destructive/5 rounded px-2 py-1">{err}</p>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Preferences */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Preferenze</h3>
        <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
          <div className="flex items-start gap-2 opacity-50">
            <Checkbox disabled className="mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Crea un elenco intelligente per i nuovi contatti creati con l'importazione</p>
              <Badge variant="outline" className="mt-1 text-[10px]">Prossimamente</Badge>
            </div>
          </div>
          <div className="flex items-start gap-2 opacity-50">
            <Checkbox disabled className="mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Aggiungi i contatti importati a un flusso di lavoro</p>
              <Badge variant="outline" className="mt-1 text-[10px]">Prossimamente</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Document info */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Rivedi importazione</h3>
        <div className="flex items-center gap-3 border rounded-lg p-4 bg-muted/30">
          <FileSpreadsheet className="h-8 w-8 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{fileName}</p>
            <p className="text-xs text-muted-foreground">{formatSize(fileSize)} · {fileRows.length} righe · Modalità: {modeLabel}</p>
          </div>
          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">
            Caricato
          </Badge>
        </div>
      </div>

      {/* Mapping summary table */}
      <div>
        <h3 className="text-sm font-semibold mb-3">
          Mappatura colonne ({mappedEntries.length} di {fileHeaders.length})
        </h3>
        <ScrollArea className="max-h-[220px]">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Colonna file</TableHead>
                  <TableHead className="text-xs">Campo destinazione</TableHead>
                  <TableHead className="text-xs">Obbligatorio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappedEntries.map(({ header, field }) => (
                  <TableRow key={header}>
                    <TableCell className="text-sm py-1.5">{header}</TableCell>
                    <TableCell className="text-sm py-1.5">{field?.label || mapping[header]}</TableCell>
                    <TableCell className="py-1.5">
                      {field?.required ? (
                        <Badge className="bg-primary/10 text-primary border-0 text-[10px]">Sì</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
      </div>

      {/* Consent */}
      <div className="flex items-start gap-2 border rounded-lg p-4 bg-muted/20">
        <Checkbox
          id="consent"
          checked={consent}
          onCheckedChange={(v) => onConsentChange(!!v)}
          className="mt-0.5"
        />
        <label htmlFor="consent" className="text-sm text-muted-foreground cursor-pointer leading-relaxed">
          Confermo che tutti i {label} coinvolti in questa importazione hanno acconsentito a essere contattati
          e che i dati rispettano le normative sulla privacy (GDPR).
        </label>
      </div>
    </div>
  );
}
