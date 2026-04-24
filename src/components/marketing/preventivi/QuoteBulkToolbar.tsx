import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronDown,
  Download,
  FileArchive,
  Loader2,
  Trash2,
  X,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { QUOTE_STATUS_CONFIG, type QuoteStatus } from "@/lib/quoteStatus";

export interface BulkQuoteLite {
  id: string;
  quote_number: string;
  status: string;
  pdf_storage_path?: string | null;
  client_name?: string | null;
  title?: string | null;
  total?: number | null;
  created_at: string;
}

interface Props {
  selectedIds: Set<string>;
  selectedQuotes: BulkQuoteLite[];
  onClearSelection: () => void;
  onReload: () => void;
}

/**
 * Toolbar sticky con azioni bulk: elimina, cambia stato, export CSV,
 * download PDF in ZIP.
 */
export function QuoteBulkToolbar({
  selectedIds,
  selectedQuotes,
  onClearSelection,
  onReload,
}: Props) {
  const [pendingStatus, setPendingStatus] = useState<QuoteStatus | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState<null | "delete" | "status" | "csv" | "zip">(null);
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null);

  const count = selectedIds.size;
  if (count === 0) return null;

  const handleBulkDelete = async () => {
    // Solo bozze: non cancelliamo quote inviate o firmate
    const onlyDrafts = selectedQuotes.filter((q) => q.status === "bozza");
    if (onlyDrafts.length === 0) {
      toast.error("Puoi eliminare solo preventivi in bozza");
      setConfirmDelete(false);
      return;
    }
    setWorking("delete");
    try {
      const { error } = await supabase
        .from("quotes")
        .delete()
        .in(
          "id",
          onlyDrafts.map((q) => q.id)
        );
      if (error) throw error;
      toast.success(`${onlyDrafts.length} preventivi eliminati`);
      const skipped = selectedQuotes.length - onlyDrafts.length;
      if (skipped > 0) toast.info(`${skipped} saltati (non in bozza)`);
      onClearSelection();
      onReload();
    } catch (e) {
      toast.error("Errore eliminazione: " + (e as Error).message);
    } finally {
      setWorking(null);
      setConfirmDelete(false);
    }
  };

  const handleBulkStatus = async (newStatus: QuoteStatus) => {
    setPendingStatus(null);
    setWorking("status");
    try {
      const { error } = await supabase
        .from("quotes")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .in("id", Array.from(selectedIds));
      if (error) throw error;
      toast.success(`${count} preventivi impostati a "${QUOTE_STATUS_CONFIG[newStatus].label}"`);
      onClearSelection();
      onReload();
    } catch (e) {
      toast.error("Errore cambio stato: " + (e as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const handleExportCsv = async () => {
    setWorking("csv");
    try {
      const headers = [
        "Numero",
        "Cliente",
        "Titolo",
        "Stato",
        "Totale (€)",
        "Data",
      ];
      const esc = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return s.includes(";") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };
      const lines = [
        headers.join(";"),
        ...selectedQuotes.map((q) =>
          [
            esc(q.quote_number),
            esc(q.client_name ?? ""),
            esc(q.title ?? ""),
            esc(
              QUOTE_STATUS_CONFIG[q.status as QuoteStatus]?.label ?? q.status
            ),
            esc(q.total ?? 0),
            esc(format(new Date(q.created_at), "dd/MM/yyyy")),
          ].join(";")
        ),
      ];
      const blob = new Blob(["\ufeff" + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `preventivi-selezionati-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${count} preventivi esportati in CSV`);
    } catch (e) {
      toast.error("Errore export CSV: " + (e as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const handleDownloadPdfZip = async () => {
    setWorking("zip");
    setZipProgress({ done: 0, total: selectedQuotes.length });
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const failed: string[] = [];

      for (let i = 0; i < selectedQuotes.length; i++) {
        const q = selectedQuotes[i];
        try {
          let storagePath = q.pdf_storage_path;

          // Se non esiste il PDF, lo generiamo
          if (!storagePath) {
            const { data: genData, error: genErr } = await supabase.functions.invoke(
              "generate-quote-pdf",
              { body: { quote_id: q.id } }
            );
            if (genErr) throw genErr;
            storagePath = genData?.pdf_path;
          }
          if (!storagePath) throw new Error("Storage path mancante");

          const { data: fileBlob, error: dlErr } = await supabase.storage
            .from("quote-pdfs")
            .download(storagePath);
          if (dlErr) throw dlErr;

          const safeName = q.quote_number.replace(/[^\w.-]+/g, "_") + ".pdf";
          zip.file(safeName, fileBlob);
        } catch (err) {
          console.warn("Bulk PDF failed for", q.quote_number, err);
          failed.push(q.quote_number);
        } finally {
          setZipProgress({ done: i + 1, total: selectedQuotes.length });
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `preventivi-${format(new Date(), "yyyy-MM-dd")}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      if (failed.length === 0) {
        toast.success(`ZIP scaricato con ${selectedQuotes.length} PDF`);
      } else {
        toast.warning(
          `ZIP pronto: ${selectedQuotes.length - failed.length} OK, ${failed.length} falliti (${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "..." : ""})`
        );
      }
    } catch (e) {
      toast.error("Errore download ZIP: " + (e as Error).message);
    } finally {
      setWorking(null);
      setZipProgress(null);
    }
  };

  return (
    <>
      <div className="sticky top-14 z-40 bg-primary text-primary-foreground rounded-lg shadow-lg px-4 py-2 flex items-center gap-3 flex-wrap">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/10"
          onClick={onClearSelection}
          aria-label="Deseleziona tutto"
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="text-sm font-medium">
          <Badge variant="secondary" className="mr-2">
            {count}
          </Badge>
          selezionat{count === 1 ? "o" : "i"}
        </div>

        <div className="flex-1" />

        {/* Cambia stato */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="secondary" disabled={!!working}>
              Cambia stato
              <ChevronDown className="h-3.5 w-3.5 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Imposta stato a</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(
              ["bozza", "inviata", "accettata", "rifiutata", "scaduta"] as QuoteStatus[]
            ).map((s) => (
              <DropdownMenuItem
                key={s}
                onClick={() => setPendingStatus(s)}
              >
                {QUOTE_STATUS_CONFIG[s].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Export CSV */}
        <Button
          size="sm"
          variant="secondary"
          onClick={handleExportCsv}
          disabled={!!working}
        >
          {working === "csv" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <FileDown className="h-3.5 w-3.5 mr-1" />
          )}
          CSV
        </Button>

        {/* ZIP PDF */}
        <Button
          size="sm"
          variant="secondary"
          onClick={handleDownloadPdfZip}
          disabled={!!working}
        >
          {working === "zip" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              {zipProgress
                ? `${zipProgress.done}/${zipProgress.total}`
                : "..."}
            </>
          ) : (
            <>
              <FileArchive className="h-3.5 w-3.5 mr-1" /> PDF ZIP
            </>
          )}
        </Button>

        {/* Elimina */}
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setConfirmDelete(true)}
          disabled={!!working}
        >
          {working === "delete" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <Trash2 className="h-3.5 w-3.5 mr-1" />
          )}
          Elimina
        </Button>
      </div>

      {/* Conferma cambio stato */}
      <AlertDialog
        open={!!pendingStatus}
        onOpenChange={(o) => !o && setPendingStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cambia stato di {count} preventivi
            </AlertDialogTitle>
            <AlertDialogDescription>
              Verranno impostati a "
              {pendingStatus ? QUOTE_STATUS_CONFIG[pendingStatus].label : ""}". L'operazione
              è massiva e può cambiare più preventivi contemporaneamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                pendingStatus && handleBulkStatus(pendingStatus)
              }
            >
              Conferma
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conferma eliminazione */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina {count} preventivi</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno eliminati solo quelli in stato <strong>bozza</strong>. I preventivi
              inviati, firmati o convertiti saranno saltati. L'azione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina bozze
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
