import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWarehouses } from "@/hooks/useWarehouses";
import { usePermissions } from "@/hooks/usePermissions";
import { useRientroMateriale } from "@/hooks/useConsumiMateriali";
import type { ReturnCandidate } from "@/lib/magazzino/resiCantiere";
import { unitaConsumoConfrontabile } from "@/lib/distinta/consumiMateriali";
import { leggiQuantitaMovimento, formattaQuantitaMovimento } from "@/lib/magazzino/quantitaMovimento";

export default function RientroMagazzinoDialog({ orderId, orderLabel, riga, onClose, onBack }: {
  orderId: string;
  orderLabel?: string;
  riga: { id: string; nome: string; unita: string; avanzano: number; posati: number; quantita: number; rientrati: number; daGiacenza: boolean; usciti?: number } & Pick<ReturnCandidate, "protocolVersion" | "stockItemId" | "orderItemId" | "trackingMode" | "serials">;
  onClose: () => void;
  onBack?: () => void;
}) {
  const { warehouses, isLoading: warehousesLoading } = useWarehouses();
  const permissions = usePermissions();
  const v2 = riga.protocolVersion === 2;
  const serialized = v2 && riga.trackingMode === "serialized";
  const wholeOnly = !v2 || serialized || unitaConsumoConfrontabile(riga.unita) === "pz";
  const canWrite = !permissions.isLoading && permissions.canEditOrders && (!v2 || permissions.canEditWarehouse);
  const magazzini = warehouses.filter((w) => !w.linked_order_id && w.type !== "site");
  const [quantita, setQuantita] = useState(!wholeOnly || Number.isInteger(riga.avanzano) ? String(riga.avanzano) : "");
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
  const [magazzino, setMagazzino] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const rientro = useRientroMateriale(orderId);
  const q = serialized ? selectedSerials.length : leggiQuantitaMovimento(quantita) ?? 0;
  const scelto = magazzino ?? magazzini.find((w) => w.is_default)?.id ?? magazzini[0]?.id ?? null;
  const valida = canWrite && (!wholeOnly || Number.isInteger(q)) && q > 0 && q <= riga.avanzano && (riga.daGiacenza || (!warehousesLoading && !!scelto && magazzini.some((w) => w.id === scelto)));
  const save = () => {
    if (!review || !valida || inFlight.current || rientro.isPending) return;
    inFlight.current = true;
    setError(null);
    rientro.mutate({ riga: riga.id, quantita: q, magazzino: riga.daGiacenza ? null : scelto, giaRientrati: riga.rientrati,
      ...(v2 ? { protocolVersion: 2 as const, stockItemId: riga.stockItemId, orderItemId: riga.orderItemId, serialNumbers: selectedSerials } : {}) }, {
      onSuccess: onClose,
      onError: (e: Error) => setError(e.message),
      onSettled: () => { inFlight.current = false; },
    });
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !rientro.isPending) onClose(); }}>
    <DialogContent className="max-h-[90svh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{review ? "Conferma reso" : "Prepara reso"} · {riga.nome}</DialogTitle>
        <DialogDescription>{orderLabel ? `Commessa ${orderLabel}. ` : ""}Restituisci il materiale non utilizzato; il servizio verifica nuovamente il residuo alla conferma.</DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-eic-navy-deep p-4 text-white sm:grid-cols-4">
        {[[riga.usciti == null ? "Comprati" : "Prelevati", riga.usciti ?? riga.quantita], ["Posati", riga.posati], ["Già resi", riga.rientrati], ["Residuo", riga.avanzano]].map(([label, value]) => <div key={label}><dt className="text-xs text-blue-100">{label}</dt><dd className="mt-1 text-xl font-semibold">{formattaQuantitaMovimento(Number(value))} <span className="text-xs font-normal">{riga.unita}</span></dd></div>)}
      </dl>
      {!v2 && riga.usciti != null && riga.usciti > riga.quantita && <p className="text-xs text-amber-700">La riga della commessa prevede {riga.quantita} {riga.unita}: il residuo proposto usa il minore tra quantità della riga e prelevato.</p>}
      {!review ? <>
        {serialized ? <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Seleziona i seriali da rendere</legend><div className="max-h-48 divide-y overflow-y-auto rounded-xl border">{(riga.serials ?? []).map((serial) => <label key={serial.id} className="flex cursor-pointer items-center gap-3 p-3 text-sm"><input type="checkbox" checked={selectedSerials.includes(serial.serial_number)} onChange={(e) => setSelectedSerials((old) => e.target.checked ? [...old, serial.serial_number] : old.filter((value) => value !== serial.serial_number))} /><span className="font-mono">{serial.serial_number}</span><span className="ml-auto text-xs text-muted-foreground">Consegnato alla commessa</span></label>)}</div><p className="text-sm text-muted-foreground">{q} seriali selezionati · Garanzia e storico restano associati alla matricola.</p></fieldset> : <label className="space-y-1 text-sm"><span className="font-medium">Quanti rientrano</span><Input inputMode={wholeOnly ? "numeric" : "decimal"} value={quantita} onChange={(e) => setQuantita(e.target.value)} aria-label="Quanti rientrano" /></label>}
        {riga.daGiacenza ? <p className="rounded-lg border p-3 text-sm">Torna nella sua scheda di magazzino, da dove è stata presa.</p> : <label className="space-y-1 text-sm"><span className="font-medium">In quale magazzino</span><Select value={scelto ?? undefined} onValueChange={setMagazzino}><SelectTrigger aria-label="Magazzino"><SelectValue placeholder="Scegli magazzino" /></SelectTrigger><SelectContent>{magazzini.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select></label>}
        {!v2 && (!Number.isInteger(riga.avanzano) || !Number.isInteger(q)) && <p className="text-xs text-amber-700">Il servizio attuale accetta resi interi. Indica esplicitamente quanti restituire; il residuo non viene arrotondato.</p>}
        {!valida && !serialized && quantita.trim() !== "" && <p className="text-xs text-red-700">{q > riga.avanzano ? `Ne avanzano ${riga.avanzano}: il resto è già posato o rientrato.` : (wholeOnly && !Number.isInteger(q)) || q <= 0 ? wholeOnly ? "Inserisci una quantità intera maggiore di zero." : "Inserisci una quantità maggiore di zero." : !riga.daGiacenza && !scelto ? "Scegli un magazzino disponibile." : "Verifica i permessi prima di continuare."}</p>}
      </> : <div className="space-y-3 rounded-xl border p-4"><p className="text-lg font-semibold">Rientrano {formattaQuantitaMovimento(q)} {riga.unita}</p>{serialized && <p className="font-mono text-sm">{selectedSerials.join(" · ")}</p>}<p className="text-sm">{riga.daGiacenza ? "Destinazione: scheda e magazzino di origine." : `Destinazione: ${magazzini.find((w) => w.id === scelto)?.name ?? "Da verificare"}.`}</p><p className="text-sm text-muted-foreground">{v2 ? "Ogni quantità resa viene collegata alla sua uscita originale, conservandone il costo. Il residuo viene ricontrollato alla conferma." : "Il servizio valorizza il rientro dagli scarichi collegati e riduce il costo attribuito alla commessa. Non crea una nuova fattura o un acquisto."}</p><p className="text-sm">Residuo della riga dopo questo reso: {formattaQuantitaMovimento(Number((riga.avanzano - q).toFixed(6)))} {riga.unita}.</p></div>}
      {!canWrite && <p role="alert" className="text-sm text-destructive">Non hai il permesso di modificare i materiali della commessa.</p>}
      {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error} I dati compilati sono conservati; ricontrolla il residuo prima di riprovare.</p>}
      <DialogFooter><Button variant="outline" disabled={rientro.isPending} onClick={review ? () => setReview(false) : onBack ?? onClose}>{review ? "Modifica reso" : onBack ? "Torna ai materiali" : "Annulla"}</Button>{review ? <Button disabled={!valida || rientro.isPending} onClick={save}>{rientro.isPending ? "Registrazione…" : `Fai rientrare ${formattaQuantitaMovimento(q)}`}</Button> : <Button disabled={!valida} onClick={() => setReview(true)}>Controlla reso</Button>}</DialogFooter>
    </DialogContent>
  </Dialog>;
}
