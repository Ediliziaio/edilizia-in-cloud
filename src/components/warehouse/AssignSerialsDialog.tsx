/**
 * Dialog per assegnare seriali (stock_units) a una riga commessa specifica.
 *
 * Use case fotovoltaico/impiantistica:
 *  Commessa "Villa Rossi" → riga "Modulo SunPower SPR-P7-500, qty=12"
 *  L'utente apre questo dialog, scansiona QR/barcode di ognuno dei 12 pannelli
 *  (o li digita manualmente) → assegnazione batch a quella riga specifica.
 *
 * I seriali devono già esistere in stock_units (perché entrati da DDT ricezione).
 * Per seriali non trovati, il dialog mostra warning ma NON crea unit "al volo"
 * (l'inserimento non tracciato genererebbe inconsistenze con il flusso ODA→DDT).
 */
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ScanLine, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { BarcodeScanner } from "@/components/warehouse/BarcodeScanner";
import {
  useAssignSerialsToOrderItem,
  useStockUnitsByOrderItem,
  useUnassignSerial,
} from "@/hooks/warehouse/useStockUnits";

interface AssignSerialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderItemId: string;
  /** Quantità target della riga commessa (es. 12 pannelli). */
  expectedQty: number;
  /** Etichetta articolo da mostrare in header (es. "Modulo SunPower SPR-P7-500"). */
  itemLabel?: string;
}

export function AssignSerialsDialog({
  open,
  onOpenChange,
  orderId,
  orderItemId,
  expectedQty,
  itemLabel,
}: AssignSerialsDialogProps) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [serialInput, setSerialInput] = useState("");
  const [pending, setPending] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<{
    notFound: string[];
    alreadyReserved: { serial: string; reservedToOrderId: string | null }[];
  } | null>(null);

  const { data: assignedUnits = [], isLoading: loadingAssigned } =
    useStockUnitsByOrderItem(orderItemId);
  const assignMutation = useAssignSerialsToOrderItem();
  const unassignMutation = useUnassignSerial();

  const alreadyAssignedCount = assignedUnits.length;
  const targetCount = expectedQty;
  const remaining = Math.max(0, targetCount - alreadyAssignedCount);

  // Pending = serial digitati/scannerizzati ma non ancora confermati con submit.
  // Filtra fuori duplicati e quelli già assegnati.
  const assignedSet = useMemo(
    () => new Set(assignedUnits.map((u) => u.serial_number)),
    [assignedUnits],
  );
  const pendingUnique = useMemo(
    () =>
      Array.from(new Set(pending.map((s) => s.trim()))).filter(
        (s) => s && !assignedSet.has(s),
      ),
    [pending, assignedSet],
  );

  const addPending = (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    setPending((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
    setLastResult(null);
  };

  const removePending = (serial: string) => {
    setPending((prev) => prev.filter((s) => s !== serial));
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (serialInput.trim()) {
      addPending(serialInput);
      setSerialInput("");
    }
  };

  const handleScan = (scanned: string) => {
    addPending(scanned);
    setScannerOpen(false);
  };

  const handleConfirm = async () => {
    if (pendingUnique.length === 0) return;
    const result = await assignMutation.mutateAsync({
      orderId,
      orderItemId,
      serials: pendingUnique,
    });
    setLastResult({
      notFound: result.notFound,
      alreadyReserved: result.alreadyReserved,
    });
    // Mantieni nel pending solo quelli problematici (notFound o alreadyReserved),
    // così l'utente vede cosa correggere senza ridigitare.
    const problematic = new Set([
      ...result.notFound,
      ...result.alreadyReserved.map((x) => x.serial),
    ]);
    setPending((prev) => prev.filter((s) => problematic.has(s)));
  };

  const handleUnassign = async (unitId: string) => {
    await unassignMutation.mutateAsync({ unitId });
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      // Reset state on close
      setPending([]);
      setLastResult(null);
      setSerialInput("");
    }
    onOpenChange(next);
  };

  const isComplete = alreadyAssignedCount >= targetCount;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Assegna seriali alla commessa
              {isComplete && (
                <Badge variant="default" className="bg-emerald-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Completata
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="space-y-1">
              {itemLabel && (
                <span className="font-medium block">{itemLabel}</span>
              )}
              <span>
                Target: <strong>{targetCount}</strong> · Assegnati:{" "}
                <strong className={isComplete ? "text-emerald-600" : "text-amber-600"}>
                  {alreadyAssignedCount}
                </strong>{" "}
                · Mancanti: <strong>{remaining}</strong>
              </span>
            </DialogDescription>
          </DialogHeader>

          {/* Sezione input nuovi seriali */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <form onSubmit={handleManualSubmit} className="flex-1 flex gap-2">
                <Input
                  placeholder="Digita o incolla seriale e premi Invio"
                  value={serialInput}
                  onChange={(e) => setSerialInput(e.target.value)}
                  autoFocus
                />
                <Button type="submit" variant="outline" size="sm" disabled={!serialInput.trim()}>
                  Aggiungi
                </Button>
              </form>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setScannerOpen(true)}
              >
                <ScanLine className="h-4 w-4 mr-1" />
                Scannerizza
              </Button>
            </div>

            {/* Lista pending */}
            {pendingUnique.length > 0 && (
              <div className="border rounded-md p-2 space-y-1">
                <p className="text-xs text-muted-foreground mb-1">
                  Da confermare ({pendingUnique.length}):
                </p>
                <div className="flex flex-wrap gap-1">
                  {pendingUnique.map((s) => (
                    <Badge key={s} variant="secondary" className="gap-1 font-mono text-xs">
                      {s}
                      <button
                        type="button"
                        onClick={() => removePending(s)}
                        className="hover:text-destructive"
                        aria-label={`Rimuovi ${s}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Risultato ultimo submit */}
            {lastResult && (lastResult.notFound.length > 0 || lastResult.alreadyReserved.length > 0) && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="space-y-1 text-xs">
                  {lastResult.notFound.length > 0 && (
                    <div>
                      <strong>{lastResult.notFound.length}</strong> seriali non trovati in magazzino:{" "}
                      <span className="font-mono">{lastResult.notFound.join(", ")}</span>
                    </div>
                  )}
                  {lastResult.alreadyReserved.length > 0 && (
                    <div>
                      <strong>{lastResult.alreadyReserved.length}</strong> già assegnati ad altre commesse:{" "}
                      <span className="font-mono">
                        {lastResult.alreadyReserved.map((x) => x.serial).join(", ")}
                      </span>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Lista seriali già assegnati */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Seriali già assegnati ({alreadyAssignedCount}):
              </p>
              {loadingAssigned ? (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Caricamento...
                </div>
              ) : assignedUnits.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Nessuno ancora.</p>
              ) : (
                <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                  {assignedUnits.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between px-2 py-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{u.serial_number}</span>
                        <Badge
                          variant="outline"
                          className={
                            u.status === "delivered" || u.status === "installed"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : u.status === "reserved"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : ""
                          }
                        >
                          {u.status}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnassign(u.id)}
                        disabled={
                          unassignMutation.isPending ||
                          u.status === "delivered" ||
                          u.status === "installed"
                        }
                        title={
                          u.status === "delivered" || u.status === "installed"
                            ? "Non si possono liberare seriali già consegnati"
                            : "Libera seriale"
                        }
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => handleClose(false)}>
              Chiudi
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={pendingUnique.length === 0 || assignMutation.isPending}
            >
              {assignMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Conferma {pendingUnique.length > 0 ? `(${pendingUnique.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={handleScan}
      />
    </>
  );
}
