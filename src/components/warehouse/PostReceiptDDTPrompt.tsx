// ============================================================================
// PostReceiptDDTPrompt — Prompt procedurale post-ricezione merce
// ----------------------------------------------------------------------------
// Mostrato DOPO un `insert_goods_receipt_atomic` riuscito per proporre di:
//   • Creare un DDT formale (wizard NewDDTDialog) sull'ODA collegato
//   • Allegare la foto appena scattata a un DDT esistente dell'ODA
//   • Chiudere senza azioni aggiuntive
//
// Scopre automaticamente l'ODA a partire da `order_item_id` via
// `purchase_order_items.order_item_id → purchase_order_id`.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  FileCheck,
  Paperclip,
  FileText,
  Loader2,
  PackageCheck,
  Info,
  ShoppingCart,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useDDTByPurchaseOrder,
  useDDTAttachments,
} from "@/hooks/useDDTRicezione";
import { NewDDTDialog } from "@/components/ddt/NewDDTDialog";

interface PostReceiptDDTPromptProps {
  open: boolean;
  /** Chiamata quando l'utente termina (skip o wizard creato o allegato) */
  onDone: () => void;
  /** ID dell'order_item appena ricevuto — usato per scoprire l'ODA */
  orderItemId: string;
  /** Nome articolo (solo display) */
  orderItemName?: string;
  /** Foto DDT catturata durante la ricezione (opzionale, usata per allegato rapido) */
  capturedPhoto?: File | null;
  /**
   * Numero DDT già inserito in ricezione (reservato per future espansioni del
   * wizard che accettino un prefill del numero DDT).
   */
  capturedDdtNumber?: string;
}

export function PostReceiptDDTPrompt({
  open,
  onDone,
  orderItemId,
  orderItemName = "merce",
  capturedPhoto,
}: PostReceiptDDTPromptProps) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedDdtId, setSelectedDdtId] = useState<string>("");
  const [isAttaching, setIsAttaching] = useState(false);

  // ── Resolve purchase_order_id from order_item_id ─────────────────────
  // purchase_order_items ha FK order_item_id → order_items.id. Una riga può
  // non esistere se l'articolo ordine-cliente non è mai stato assegnato a un
  // ODA; in quel caso offriamo comunque "solo ricezione".
  const poQuery = useQuery({
    queryKey: ["post-receipt-prompt", "po-from-item", orderItemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select(
          "purchase_order_id, purchase_orders(id, oda_number, suppliers(name))",
        )
        .eq("order_item_id", orderItemId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as {
        purchase_order_id: string;
        purchase_orders?: {
          id: string;
          oda_number: string;
          suppliers?: { name: string } | null;
        } | null;
      } | null;
    },
    enabled: open && !!orderItemId,
    staleTime: 60_000,
  });

  const poId = poQuery.data?.purchase_order_id ?? null;
  const odaNumber = poQuery.data?.purchase_orders?.oda_number;
  const supplierName = poQuery.data?.purchase_orders?.suppliers?.name;

  // ── DDT esistenti per questo ODA ─────────────────────────────────────
  const { data: existingDdts = [], isLoading: ddtsLoading } =
    useDDTByPurchaseOrder(poId);
  const hasExisting = existingDdts.length > 0;
  const { uploadAttachments } = useDDTAttachments();

  // Auto-select se c'è un solo DDT
  useEffect(() => {
    if (hasExisting && existingDdts.length === 1 && !selectedDdtId) {
      setSelectedDdtId(existingDdts[0].id);
    }
  }, [hasExisting, existingDdts, selectedDdtId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setSelectedDdtId("");
        setIsAttaching(false);
      }, 200);
    }
  }, [open]);

  const handleAttachToExisting = async () => {
    if (!selectedDdtId || !capturedPhoto) {
      onDone();
      return;
    }
    setIsAttaching(true);
    try {
      await uploadAttachments.mutateAsync({
        ddtId: selectedDdtId,
        files: [{ file: capturedPhoto, kind: "ddt" }],
      });
      onDone();
    } catch {
      // toast gestito dalla mutation
    } finally {
      setIsAttaching(false);
    }
  };

  const canShowWizardButton = !!poId;
  const canShowAttachButton = hasExisting && !!capturedPhoto;

  // Titolo e descrizione intelligenti in base al contesto
  const contextLine = useMemo(() => {
    if (odaNumber && supplierName) {
      return `ODA ${odaNumber} · ${supplierName}`;
    }
    if (odaNumber) return `ODA ${odaNumber}`;
    return null;
  }, [odaNumber, supplierName]);

  return (
    <>
      <Dialog
        open={open && !wizardOpen}
        onOpenChange={(o) => {
          if (!o) onDone();
        }}
      >
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          {/* Hero success */}
          <div className="bg-gradient-to-br from-emerald-50 via-emerald-50/60 to-background border-b px-5 pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-emerald-100 p-2 shrink-0">
                <PackageCheck className="h-5 w-5 text-emerald-700" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogHeader className="space-y-1 text-left">
                  <DialogTitle className="text-base font-semibold flex items-center gap-2">
                    Ricezione registrata
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  </DialogTitle>
                </DialogHeader>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  <strong className="text-foreground">{orderItemName}</strong>{" "}
                  è stato ricevuto in magazzino.
                </p>
                {contextLine && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <ShoppingCart className="h-3 w-3" />
                    <span className="truncate">{contextLine}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-sm font-medium">
              Vuoi registrare il <span className="text-primary">DDT di consegna</span>?
            </p>
            <p className="text-xs text-muted-foreground">
              Completare il DDT formale permette tracciabilità piena (corriere,
              autista, verifica qualità, firma, allegati).
            </p>

            {/* Preview foto catturata */}
            {capturedPhoto && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
                {capturedPhoto.type.startsWith("image/") ? (
                  <img
                    src={URL.createObjectURL(capturedPhoto)}
                    alt={capturedPhoto.name}
                    className="h-10 w-10 object-cover rounded shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0 text-xs">
                  <p className="font-medium truncate">{capturedPhoto.name}</p>
                  <p className="text-muted-foreground">
                    Foto pronta per upload
                  </p>
                </div>
              </div>
            )}

            {/* PO lookup loading */}
            {poQuery.isLoading && (
              <div className="rounded-md bg-muted/30 p-2.5 text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Ricerca ordine d'acquisto…
              </div>
            )}

            {/* Fallback: nessun ODA collegato */}
            {!poQuery.isLoading && !poId && (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 flex items-start gap-2">
                <Info className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900">
                  <p className="font-medium">Nessun ODA collegato</p>
                  <p className="text-amber-800">
                    L'articolo non risulta su un Ordine d'Acquisto. Puoi
                    chiudere e gestire il DDT più tardi dal menu DDT.
                  </p>
                </div>
              </div>
            )}

            {/* Select DDT esistente (se any) */}
            {hasExisting && (
              <div className="space-y-1.5 rounded-md border bg-sky-50/50 p-2.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-sky-900">
                  <Paperclip className="h-3.5 w-3.5" />
                  {existingDdts.length} DDT esistent
                  {existingDdts.length === 1 ? "e" : "i"} per questo ODA
                </div>
                {capturedPhoto ? (
                  <Select
                    value={selectedDdtId}
                    onValueChange={setSelectedDdtId}
                  >
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue placeholder="Seleziona DDT…" />
                    </SelectTrigger>
                    <SelectContent>
                      {existingDdts.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          <div className="flex flex-col gap-0.5 py-0.5">
                            <span className="font-mono text-xs font-medium">
                              {d.numero_ddt}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(d.data_ricezione), "dd/MM/yyyy", {
                                locale: it,
                              })}{" "}
                              · {d.stato}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-[11px] text-sky-800">
                    Scatta una foto in fase di ricezione per allegarla a un DDT
                    esistente.
                  </p>
                )}
              </div>
            )}

            {!poQuery.isLoading && poId && !hasExisting && !ddtsLoading && (
              <p className="text-[11px] text-muted-foreground italic">
                Nessun DDT registrato per questo ODA. Crealo qui.
              </p>
            )}
          </div>

          {/* Footer actions */}
          <DialogFooter className="flex-col sm:flex-col gap-2 border-t bg-muted/20 px-5 py-3 sm:space-x-0">
            {canShowWizardButton && (
              <Button
                onClick={() => setWizardOpen(true)}
                className="w-full gap-2 h-10"
                disabled={isAttaching}
              >
                <FileCheck className="h-4 w-4" />
                Crea DDT formale (wizard)
              </Button>
            )}
            {canShowAttachButton && (
              <Button
                variant="secondary"
                onClick={handleAttachToExisting}
                disabled={isAttaching || !selectedDdtId || !capturedPhoto}
                className="w-full gap-2 h-10"
              >
                {isAttaching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
                Allega foto al DDT selezionato
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={onDone}
              disabled={isAttaching}
              className="w-full text-muted-foreground"
            >
              Solo ricezione — chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wizard DDT formale — quando si chiude (cancel o post-creazione)
          consideriamo il flow post-ricezione completato. NewDDTDialog chiama
          onOpenChange(false) in entrambi i casi, e dopo creazione naviga al
          detail del nuovo DDT. */}
      {poId && (
        <NewDDTDialog
          open={wizardOpen}
          onOpenChange={(o) => {
            setWizardOpen(o);
            if (!o) onDone();
          }}
          prefillPurchaseOrderId={poId}
        />
      )}
    </>
  );
}
