/**
 * Dialog "Esporta seriali per registrazione garanzia fornitore".
 *
 * Use case: l'utente ha appena assegnato 12 pannelli SunPower a una commessa
 * (o creato un lotto). Step successivo manuale: registrare ogni seriale nel
 * portale fornitore per attivare la garanzia individuale.
 *
 * Questo dialog produce 3 output:
 *  - Lista plain text (un seriale per riga) — pronta per copy/paste in qualsiasi
 *    portale che accetta input multilinea
 *  - CSV con colonne: serial_number, articolo, lotto, data acquisto — utile
 *    per portali che richiedono upload CSV
 *  - JSON compatto — per integration API future
 *
 * + bottone "Copia in clipboard" + bottone "Scarica CSV" + link diretto al
 * portale fornitore (URL salvato in suppliers.warranty_portal_url, fallback
 * a Google search del fornitore).
 */
import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { escapeCsvCell } from "@/lib/csvExport";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Copy, Download, ExternalLink, Check, FileText } from "lucide-react";
import { toast } from "sonner";

export interface WarrantyExportItem {
  serial_number: string;
  articolo?: string | null;
  internal_code?: string | null;
  lotto_codice?: string | null;
  purchase_date?: string | null;
  warranty_months?: number | null;
}

interface WarrantyExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: WarrantyExportItem[];
  /** Nome fornitore (per filename CSV + Google search). */
  supplierName?: string | null;
  /** URL portale fornitore (se conosciuto via suppliers.warranty_portal_url). */
  supplierPortalUrl?: string | null;
}

function downloadFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvCell(v: string | null | undefined): string {
  return escapeCsvCell(v, ",");
}

export function WarrantyExportDialog({
  open,
  onOpenChange,
  items,
  supplierName,
  supplierPortalUrl,
}: WarrantyExportDialogProps) {
  const [copied, setCopied] = useState<"text" | "csv" | "json" | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const filenameBase = supplierName
    ? `garanzie_${supplierName.replace(/[^\w-]+/g, "_")}_${today}`
    : `garanzie_${today}`;

  const plainText = useMemo(
    () => items.map((it) => it.serial_number).join("\n"),
    [items],
  );

  const csvText = useMemo(() => {
    const header = ["serial_number", "articolo", "codice_interno", "lotto", "data_acquisto", "garanzia_mesi"];
    const rows = items.map((it) =>
      [
        csvCell(it.serial_number),
        csvCell(it.articolo ?? null),
        csvCell(it.internal_code ?? null),
        csvCell(it.lotto_codice ?? null),
        csvCell(it.purchase_date ?? null),
        csvCell(it.warranty_months != null ? String(it.warranty_months) : null),
      ].join(","),
    );
    return [header.join(","), ...rows].join("\n");
  }, [items]);

  const jsonText = useMemo(() => JSON.stringify(items, null, 2), [items]);

  const copy = async (format: "text" | "csv" | "json") => {
    try {
      const content = format === "text" ? plainText : format === "csv" ? csvText : jsonText;
      await navigator.clipboard.writeText(content);
      setCopied(format);
      toast.success("Copiato negli appunti");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Impossibile copiare. Seleziona il testo manualmente.");
    }
  };

  const download = (format: "text" | "csv" | "json") => {
    const map = {
      text: { ext: "txt", mime: "text/plain", content: plainText },
      csv: { ext: "csv", mime: "text/csv", content: csvText },
      json: { ext: "json", mime: "application/json", content: jsonText },
    } as const;
    const { ext, mime, content } = map[format];
    downloadFile(`${filenameBase}.${ext}`, content, mime);
  };

  const portalHref =
    supplierPortalUrl ||
    (supplierName
      ? `https://www.google.com/search?q=${encodeURIComponent(`${supplierName} registrazione garanzia portale`)}`
      : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-orange-600" />
            Esporta seriali per garanzia
          </DialogTitle>
          <DialogDescription>
            {items.length} {items.length === 1 ? "seriale" : "seriali"} pronti per registrazione sul portale
            {supplierName ? <> di <strong>{supplierName}</strong></> : " fornitore"}.
          </DialogDescription>
        </DialogHeader>

        {items.length === 0 ? (
          <Alert>
            <AlertDescription>
              Nessun seriale da esportare. Assegna prima i seriali ai pezzi tramite "Gestisci seriali".
            </AlertDescription>
          </Alert>
        ) : (
          <Tabs defaultValue="text" className="w-full">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="text">Plain text</TabsTrigger>
              <TabsTrigger value="csv">CSV</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Un seriale per riga. Ideale per portali che accettano paste in textarea.
              </p>
              <Textarea
                readOnly
                value={plainText}
                rows={Math.min(items.length, 12)}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => copy("text")}>
                  {copied === "text" ? (
                    <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 mr-1" />
                  )}
                  Copia
                </Button>
                <Button size="sm" variant="outline" onClick={() => download("text")}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Scarica .txt
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="csv" className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Colonne: serial_number, articolo, codice_interno, lotto, data_acquisto, garanzia_mesi.
                Compatibile con Excel / Google Sheets / portali con upload CSV.
              </p>
              <Textarea
                readOnly
                value={csvText}
                rows={Math.min(items.length + 1, 12)}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => copy("csv")}>
                  {copied === "csv" ? (
                    <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 mr-1" />
                  )}
                  Copia
                </Button>
                <Button size="sm" variant="outline" onClick={() => download("csv")}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Scarica .csv
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="json" className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Formato JSON per integrazioni API o automation.
              </p>
              <Textarea
                readOnly
                value={jsonText}
                rows={Math.min(items.length * 2, 14)}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => copy("json")}>
                  {copied === "json" ? (
                    <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 mr-1" />
                  )}
                  Copia
                </Button>
                <Button size="sm" variant="outline" onClick={() => download("json")}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Scarica .json
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {portalHref && (
          <Alert>
            <ExternalLink className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-3">
              <span className="text-xs">
                {supplierPortalUrl
                  ? `Apri il portale ${supplierName ?? "fornitore"} per registrare i seriali.`
                  : `Cerca il portale ${supplierName ?? "fornitore"} su Google.`}
              </span>
              <Button asChild size="sm" variant="default">
                <a href={portalHref} target="_blank" rel="noopener noreferrer">
                  Apri portale <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Badge variant="outline" className="mr-auto text-xs">
            {items.length} {items.length === 1 ? "seriale" : "seriali"}
          </Badge>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
