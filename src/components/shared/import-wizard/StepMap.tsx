import { useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ImportField } from "@/components/shared/CSVImportDialog";
import type { ObjectType } from "./StepStart";

interface StepMapProps {
  objectType: ObjectType;
  fields: ImportField[];
  fileHeaders: string[];
  fileRows: string[][];
  mapping: Record<string, string>;
  onMappingChange: (mapping: Record<string, string>) => void;
  skipUnmapped: boolean;
  onSkipUnmappedChange: (v: boolean) => void;
}

export function StepMap({
  objectType, fields, fileHeaders, fileRows, mapping, onMappingChange, skipUnmapped, onSkipUnmappedChange,
}: StepMapProps) {
  const previewRows = fileRows.slice(0, 3);

  const missingRequired = useMemo(() => {
    const mappedKeys = new Set(Object.values(mapping));
    return fields.filter((f) => f.required && !mappedKeys.has(f.key));
  }, [mapping, fields]);

  const unmappedCount = fileHeaders.filter((h) => !mapping[h]).length;
  const objectLabel = objectType === "contacts" ? "Contatto" : "Opportunità";

  const setFieldMapping = (header: string, value: string) => {
    const next = { ...mapping };
    if (value === "__ignore__") delete next[header];
    else next[header] = value;
    onMappingChange(next);
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Alert */}
      <div className="flex items-start gap-2 text-sm bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Assicurati che tutti i campi obbligatori siano mappati correttamente.</span>
      </div>

      {/* Required fields box */}
      {missingRequired.length > 0 && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Campi obbligatori non mappati: {missingRequired.map((f) => f.label).join(", ")}
          </span>
        </div>
      )}

      {/* Mapping table */}
      <ScrollArea className="max-h-[400px]">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-[22%]">Intestazione colonna nel file</TableHead>
                <TableHead className="text-xs w-[22%]">Informazioni di anteprima</TableHead>
                <TableHead className="text-xs w-[12%]">Stato</TableHead>
                <TableHead className="text-xs w-[12%]">Oggetto</TableHead>
                <TableHead className="text-xs w-[32%]">Campi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fileHeaders.map((header, hIdx) => {
                const isMapped = !!mapping[header];
                return (
                  <TableRow key={header}>
                    <TableCell className="text-sm font-medium py-2">{header}</TableCell>
                    <TableCell className="py-2">
                      <div className="space-y-0.5">
                        {previewRows.map((row, i) => (
                          <p key={i} className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {row[hIdx] || "—"}
                          </p>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge
                        variant={isMapped ? "default" : "secondary"}
                        className={isMapped
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0"
                          : "bg-muted text-muted-foreground border-0"
                        }
                      >
                        {isMapped ? "Mappato" : "In sospeso"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">{objectLabel}</TableCell>
                    <TableCell className="py-2">
                      <Select
                        value={mapping[header] || "__ignore__"}
                        onValueChange={(val) => setFieldMapping(header, val)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__ignore__">— Seleziona campo —</SelectItem>
                          {fields.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              {f.label}{f.required ? " *" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </ScrollArea>

      {/* Skip unmapped checkbox */}
      {unmappedCount > 0 && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="skip-unmapped"
            checked={skipUnmapped}
            onCheckedChange={(v) => onSkipUnmappedChange(!!v)}
          />
          <label htmlFor="skip-unmapped" className="text-sm text-muted-foreground cursor-pointer">
            Non importare dati in {unmappedCount} colon{unmappedCount === 1 ? "na" : "ne"} non mappat{unmappedCount === 1 ? "a" : "e"}
          </label>
        </div>
      )}
    </div>
  );
}
