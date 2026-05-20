/**
 * Dialog per assegnare seriali (stock_units) a un LOTTO.
 *
 * Use case: utente crea lotto "LOT-2026-001 — Pannelli SunPower", poi
 * apre questo dialog e scansiona/digita gli N seriali ricevuti per
 * raggrupparli sotto questo lotto.
 *
 * Differenza con AssignSerialsDialog (a commessa): qui il target è il
 * lotto. NON cambia status — il seriale resta nello stato corrente
 * (available/reserved/...). Setta solo lotto_id.
 */
import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ScanLine, X, AlertCircle, ListPlus } from "lucide-react";
import { BarcodeScanner } from "@/components/warehouse/BarcodeScanner";
import { useAssignSerialsToLotto } from "@/hooks/warehouse/useStockUnits";

interface AssignSerialsToLottoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lottoId: string;
  /** Codice lotto da mostrare in header (es. "LOT-2026-001"). */
  lottoCode?: string;
  /** Articolo del lotto (se collegato a catalogo). */
  articolo?: string | null;
}

export function AssignSerialsToLottoDialog({
  open,
  onOpenChange,
  lottoId,
  lottoCode,
  articolo,
}: AssignSerialsToLottoDialogProps) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [serialInput, setSerialInput] = useState("");
  const [pending, setPending] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<{
    notFound: string[];
    alreadyOther: string[];
  } | null>(null);

  const assignMutation = useAssignSerialsToLotto();

  const pendingUnique = Array.from(new Set(pending.map((s) => s.trim()))).filter(Boolean);

  const addPending = (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    setPending((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
    setLastResult(null);
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
      lottoId,
      serials: pendingUnique,
    });
    setLastResult({
      notFound: result.notFound,
      alreadyOther: result.alreadyReserved.map((x) => x.serial),
    });
    const problematic = new Set([
      ...result.notFound,
      ...result.alreadyReserved.map((x) => x.serial),
    ]);
    setPending((prev) => prev.filter((s) => problematic.has(s)));
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      setPending([]);
      setLastResult(null);
      setSerialInput("");
    }
    onOpenChange(next);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assegna seriali al lotto</DialogTitle>
            <DialogDescription>
              {lottoCode && <span className="font-mono font-medium block">{lottoCode}</span>}
              {articolo && <span className="text-xs">{articolo}</span>}
            </DialogDescription>
          </DialogHeader>

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
              <Button type="button" variant="outline" size="sm" onClick={() => setScannerOpen(true)}>
                <ScanLine className="h-4 w-4 mr-1" />
                Scannerizza
              </Button>
            </div>

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
                        onClick={() => setPending((prev) => prev.filter((p) => p !== s))}
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

            {lastResult && (lastResult.notFound.length > 0 || lastResult.alreadyOther.length > 0) && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="space-y-1 text-xs">
                  {lastResult.notFound.length > 0 && (
                    <div>
                      <strong>{lastResult.notFound.length}</strong> seriali non in magazzino:{" "}
                      <span className="font-mono">{lastResult.notFound.join(", ")}</span>
                    </div>
                  )}
                  {lastResult.alreadyOther.length > 0 && (
                    <div>
                      <strong>{lastResult.alreadyOther.length}</strong> già appartenenti ad altri lotti
                      (non spostati):{" "}
                      <span className="font-mono">{lastResult.alreadyOther.join(", ")}</span>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => handleClose(false)}>
              Chiudi
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={pendingUnique.length === 0 || assignMutation.isPending}
            >
              {assignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <ListPlus className="h-4 w-4 mr-1" />
              Conferma {pendingUnique.length > 0 ? `(${pendingUnique.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BarcodeScanner open={scannerOpen} onOpenChange={setScannerOpen} onScan={handleScan} />
    </>
  );
}
