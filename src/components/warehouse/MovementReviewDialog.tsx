import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Loader2, PackageCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { MovementBalance } from "@/hooks/warehouse/useMovementBalances";
import { formattaQuantitaMovimento as fmt } from "@/lib/magazzino/quantitaMovimento";
import type { BatchScanEntry } from "./BatchBarcodeScanner";

/** Conferma esplicita, comune a inserimento manuale e scanner. Non esegue scritture. */
export function MovementReviewDialog({ open, operation, warehouse, counterpart, entries, onBack, onConfirm, pending, error, blocked, onOpenChange, onRecover, balances, balancesLoading, balancesUnavailable, ownReservations, additionalSummary }: {
  balances?: (MovementBalance & { id: string })[];
  balancesLoading?: boolean;
  balancesUnavailable?: boolean;
  ownReservations?: Map<string, number>;
  additionalSummary?: import("react").ReactNode;
  open: boolean;
  operation: "carico" | "prelievo";
  warehouse: string;
  counterpart?: string;
  entries: BatchScanEntry[];
  onBack: () => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onRecover?: () => void;
  pending?: boolean;
  error?: string | null;
  blocked?: string | null;
}) {
  const incoming = operation === "carico";
  const [verified, setVerified] = useState(false);
  const ambiguous = entries.some((entry) => entry.ambiguous);
  return <Dialog open={open} onOpenChange={(value) => { if (!pending) onOpenChange(value); }}>
    <DialogContent className="max-h-[90svh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>Controlla {incoming ? "il carico" : "il prelievo"}</DialogTitle><DialogDescription>Verifica magazzino, articoli e quantità prima di registrare il movimento.</DialogDescription></DialogHeader>
      <dl className="grid gap-3 rounded-xl bg-eic-navy-deep p-4 text-white sm:grid-cols-3">
        <div><dt className="text-xs text-blue-100">{incoming ? "Magazzino di arrivo" : "Magazzino di partenza"}</dt><dd className="mt-1 font-semibold">{warehouse}</dd></div>
        <div><dt className="text-xs text-blue-100">{incoming ? "Fornitore / riferimento" : "Destinazione"}</dt><dd className="mt-1 font-semibold">{counterpart || "Non indicato"}</dd></div>
        <div><dt className="text-xs text-blue-100">Righe da registrare</dt><dd className="mt-1 text-xl font-semibold">{entries.length}</dd></div>
      </dl>
      <ul aria-label="Articoli da confermare" className="max-h-[40vh] divide-y overflow-y-auto rounded-xl border">
        {entries.map((entry) => <li key={entry.clientUuid} className="space-y-1 p-3">
          <div className="flex items-start justify-between gap-3"><span className="font-medium">{entry.itemName || "Articolo da associare"}</span><span className="shrink-0 font-semibold tabular-nums">{Number(entry.quantity).toLocaleString("it-IT", { maximumFractionDigits: 6 })} {entry.unitOfMeasure || "unità"}</span></div>
          {(() => {
            const balance = balances?.find((row) => row.id === entry.stockItemId);
            if (!balance) return null;
            const total = entries.filter((row) => row.stockItemId === entry.stockItemId).reduce((sum, row) => sum + row.quantity, 0);
            const nextQuantity = balance.quantity + (incoming ? total : -total);
            const nextReserved = balance.reserved - (incoming ? 0 : Math.min(total, ownReservations?.get(entry.stockItemId ?? "") ?? 0, balance.reserved));
            return <dl className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2 text-xs" aria-label={`Saldi previsti ${entry.itemName}`}>
              {[["Giacenza", balance.quantity, nextQuantity], ["Impegnato", balance.reserved, nextReserved], ["Disponibile", balance.quantity - balance.reserved, nextQuantity - nextReserved]].map(([label, before, after]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium tabular-nums">{fmt(Number(before))} → {fmt(Number(after))}</dd></div>)}
            </dl>;
          })()}
          {entry.ambiguous && <p className="text-xs font-medium text-amber-700">Associazione da verificare</p>}
          {entry.trackingMode === "serialized" && <p className="break-words text-xs text-muted-foreground">Seriali ({entry.serialNumbers.length}): {entry.serialNumbers.join(", ") || "Da inserire"}</p>}
        </li>)}
      </ul>
      {additionalSummary}
      {balancesLoading && <p role="status" className="text-xs text-muted-foreground">Aggiornamento delle quantità…</p>}
      {balancesUnavailable && <p className="text-xs text-amber-800">Anteprima dei saldi non disponibile. Le quantità verranno comunque verificate alla conferma.</p>}
      {balances && balances.length > 0 && <p className="text-xs text-muted-foreground">Saldi previsti, con quantità nell’unità indicata per ciascun articolo. Eventuali movimenti contemporanei vengono ricontrollati alla conferma.</p>}
      <p className="text-xs text-muted-foreground">{incoming ? "La conferma aumenta la giacenza. Le foto vengono inviate separatamente; il file DDT viene archiviato solo nelle commesse collegate. Non viene creato un altro ordine fornitore." : "La conferma scarica la merce. Il DDT rimane un passaggio separato, proposto dopo la registrazione."}</p>
      {ambiguous && <label className="flex items-center gap-2 rounded-lg border border-amber-200 p-3 text-sm"><Checkbox checked={verified} onCheckedChange={(value) => setVerified(value === true)} />Ho verificato le associazioni segnalate</label>}
      {(blocked || error) && <Alert variant="destructive"><AlertDescription>{blocked || error}</AlertDescription></Alert>}
      <DialogFooter><Button variant="outline" onClick={onBack} disabled={pending || !!onRecover}><ArrowLeft className="mr-2 h-4 w-4" />Modifica dati</Button>{onRecover && <Button variant="outline" onClick={onRecover} disabled={pending}>Verifica esito della richiesta</Button>}<Button onClick={onConfirm} disabled={pending || !!blocked || entries.length === 0 || (ambiguous && !verified)}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}{incoming ? "Conferma carico" : "Conferma prelievo"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
