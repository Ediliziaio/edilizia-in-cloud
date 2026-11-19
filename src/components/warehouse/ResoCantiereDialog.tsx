import { formattaQuantitaMovimento as fmt } from "@/lib/magazzino/quantitaMovimento";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Undo2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useReturnCandidates } from "@/hooks/warehouse/useReturnCandidates";
import { OrderSelectCombobox, type OrderOption } from "./OrderSelectCombobox";
import RientroMagazzinoDialog from "@/components/orders/materiali/RientroMagazzinoDialog";
import type { ReturnCandidate } from "@/lib/magazzino/resiCantiere";

export function ResoCantiereDialog({ onOpenChange, warehouseId }: { onOpenChange: (open: boolean) => void; warehouseId?: string | null }) {
  const { effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const canWrite = !permissions.isLoading && permissions.canEditWarehouse && permissions.canEditOrders;
  const [order, setOrder] = useState<OrderOption | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReturnCandidate | null>(null);
  const candidates = useReturnCandidates(effectiveCompany?.id, order?.id);
  const scoped = (candidates.data ?? []).filter((row) => !warehouseId || row.warehouseId === warehouseId);
  const rows = scoped.filter((row) => row.nome.toLowerCase().includes(search.trim().toLowerCase()));
  if (selected && order && canWrite) return <RientroMagazzinoDialog key={`${order.id}:${selected.id}`} orderId={order.id} orderLabel={order.order_code ?? undefined} riga={selected} onBack={() => { setSelected(null); void candidates.refetch(); }} onClose={() => { setSelected(null); void candidates.refetch(); }} />;
  return <Dialog open onOpenChange={onOpenChange}><DialogContent className="max-h-[90svh] max-w-3xl overflow-y-auto">
    <DialogHeader><DialogTitle className="flex items-center gap-2"><Undo2 className="h-5 w-5" />Reso da cantiere</DialogTitle><DialogDescription>Scegli la commessa e il materiale non utilizzato. Il rientro torna nella scheda di origine e il servizio gestisce lo storno del costo della commessa.</DialogDescription></DialogHeader>
    {!canWrite && <p role="alert" className="text-sm text-destructive">Per registrare il reso servono i permessi di modifica del magazzino e delle commesse.</p>}
    <OrderSelectCombobox companyId={effectiveCompany?.id} value={order?.id} onChange={(_id, value) => { setOrder(value); setSearch(""); }} filtroIniziale="all" ariaLabel="Commessa del reso" />
    {order && <>
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Cerca materiale da rendere" placeholder="Cerca materiale da rendere…" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      {candidates.isLoading ? <p role="status" className="p-5 text-center text-sm">Controllo prelievi, consumi approvati e resi precedenti…</p> : candidates.isError ? <div role="alert" className="rounded-xl border p-4 text-sm">Impossibile verificare i materiali. Nessun reso è stato registrato. <Button variant="outline" size="sm" onClick={() => void candidates.refetch()}>Riprova materiali</Button></div> : rows.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{search ? "Nessun materiale corrisponde alla ricerca." : "Non risultano prelievi tracciati di questa commessa nel magazzino selezionato."}</p> : <ul aria-label="Materiali del reso" className="max-h-[45vh] divide-y overflow-y-auto rounded-xl border">
        {rows.map((row) => <li key={row.id} className="space-y-2 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{row.nome}</p><p className="text-xs text-muted-foreground">{row.verified === false ? `Prelievi storici: ${row.historicalMovements ?? 0} movimenti · Residuo da verificare` : `Prelevati ${fmt(row.usciti)} · Posati ${fmt(row.posati)} · Già resi ${fmt(row.rientrati)} · Residuo ${fmt(row.avanzano)} ${row.unita}`}</p></div><Button size="sm" variant="outline" disabled={!canWrite || !!row.blocked} onClick={() => setSelected(row)}>Prepara reso</Button></div>{row.protocolVersion !== 2 && row.verified !== false && row.usciti > row.quantita && <p className="text-xs text-amber-700">Quantità della riga: {row.quantita} {row.unita}. Il residuo proposto è limitato a questa quantità; verifica i prelievi aggiuntivi.</p>}{row.blocked && <p className="text-xs text-muted-foreground">{row.blocked}</p>}</li>)}
      </ul>}
      <p className="text-xs text-muted-foreground">Qui trovi i materiali con prelievi tracciati. Per acquisti diretti o articoli da verificare, <Link className="text-primary underline" to={`/azienda/ordini/${order.id}`}>apri i materiali della commessa</Link>.</p>
    </>}
  </DialogContent></Dialog>;
}
