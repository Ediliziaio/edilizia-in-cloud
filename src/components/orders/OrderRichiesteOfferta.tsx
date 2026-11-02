/**
 * Le richieste d'offerta di una commessa, dentro «Materiali e acquisti». L'elenco e il dettaglio restano quelli di
 * /azienda/richieste-offerta: qui si vedono solo quelle della commessa e se ne crea una nuova già collegata.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileQuestion, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useAzioniMateriali, useMaterialiPerFase } from "@/hooks/useMaterialiPerFase";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { usePermissions } from "@/hooks/usePermissions";
import { useSupplierRfqs } from "@/hooks/useSupplierRfqs";
import { supabase } from "@/integrations/supabase/client";
import { acquistabile } from "@/lib/distinta/statiFase";
import { formatCurrency } from "@/lib/formatters";
import { RDO_STATUS_COLORS, RDO_STATUS_LABELS } from "@/lib/rdoStatus";
import { cn } from "@/lib/utils";

const dataIt = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const conPlurale = (n: number, uno: string, tanti: string) => `${n} ${n === 1 ? uno : tanti}`;

export function OrderRichiesteOfferta({ orderId, orderCode }: { orderId: string; orderCode?: string | null }) {
  const perm = usePermissions();
  const { rfqs, contatori, isLoading, isError } = useSupplierRfqs();
  const [nuova, setNuova] = useState(false);
  const puoCreare = !perm.solaLettura && (perm.canManagePurchasing || perm.canEditOrders || perm.isAdmin);
  const dellaCommessa = rfqs.filter(r => r.order_id === orderId);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3 max-sm:p-3 max-sm:pb-2">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          <FileQuestion className="h-4 w-4 shrink-0" />
          <span className="truncate">Richieste d’offerta</span>
        </CardTitle>
        {puoCreare && (
          <Button size="sm" className="min-h-11 font-semibold" onClick={() => setNuova(true)}>
            <Plus className="mr-1.5 h-4 w-4" />Nuova richiesta
          </Button>
        )}
      </CardHeader>
      <CardContent className="max-sm:p-3 max-sm:pt-0">
        {isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">Caricamento…</p>
        ) : isError ? (
          <p role="alert" className="text-sm">Non riesco a leggere le richieste d’offerta.</p>
        ) : dellaCommessa.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna richiesta d’offerta per questa commessa.</p>
        ) : (
          <ul className="space-y-2">
            {dellaCommessa.map(r => {
              const c = contatori[r.id];
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border p-2">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/azienda/richieste-offerta/${r.id}`} className="min-w-0 truncate text-sm font-medium underline-offset-2 hover:underline">{r.titolo}</Link>
                      <Badge className={cn("border-0 text-xs", RDO_STATUS_COLORS[r.status])}>{RDO_STATUS_LABELS[r.status] ?? r.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{r.rfq_number}</span>
                      {c && <> · {conPlurale(c.invitati, "fornitore", "fornitori")} · {conPlurale(c.risposte, "offerta", "offerte")}{c.inAttesa > 0 && <> · {c.inAttesa} in attesa</>}</>}
                      {r.scadenza_offerte && r.status !== "aggiudicata" && <> · Risposta entro {dataIt(r.scadenza_offerte)}</>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-sm">
                    {r.purchase_order_id && <Link to={`/azienda/ordini-acquisto/${r.purchase_order_id}`} className="text-xs underline underline-offset-2">Vedi l’ordine</Link>}
                    {perm.canViewCosts && c?.migliore != null && <span className="font-medium tabular-nums" title="Migliore offerta">{formatCurrency(c.migliore)}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      {nuova && <NuovaRichiesta orderId={orderId} orderCode={orderCode} onChiudi={() => setNuova(false)} />}
    </Card>
  );
}

function NuovaRichiesta({ orderId, orderCode, onChiudi }: { orderId: string; orderCode?: string | null; onChiudi: () => void }) {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const { create } = useSupplierRfqs();
  const { suppliers } = useOperationalSuppliers();
  const { fasi, isLoading } = useMaterialiPerFase(orderId);
  const azioni = useAzioniMateriali(orderId, orderCode);
  const [titolo, setTitolo] = useState(`Richiesta d'offerta${orderCode ? ` — ${orderCode}` : ""}`);
  const [fabbisogno, setFabbisogno] = useState("");
  const [scadenza, setScadenza] = useState("");
  const [articoli, setArticoli] = useState<Set<string>>(new Set());
  const [fornitori, setFornitori] = useState<Set<string>>(new Set());
  const [occupato, setOccupato] = useState(false);

  // Solo ciò che si può davvero chiedere: materiali ancora da comprare, di fasi validate, non già in un'altra richiesta.
  const daChiedere = useMemo(() => fasi.flatMap(f => acquistabile(f.validazione?.stato ?? null)
    ? f.materiali.filter(m => m.ordinabile && !m.supplier_rfq_item_id) : []), [fasi]);

  const inverti = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };
  const crea = async () => {
    if (!titolo.trim() || !effectiveCompany?.id || occupato) return;
    setOccupato(true);
    try {
      let id: string;
      if (articoli.size > 0) {
        id = await azioni.richiediOfferta.mutateAsync({ ids: [...articoli], titolo: titolo.trim(), fornitori: [...fornitori], scadenza: scadenza || null });
        if (fabbisogno) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any).from("supplier_rfqs").update({ data_fabbisogno: fabbisogno }).eq("id", id);
          if (error) toast.error("Richiesta creata, ma la data in cantiere non è stata salvata");
        }
      } else {
        const rfq = await create.mutateAsync({ titolo: titolo.trim(), order_id: orderId, data_fabbisogno: fabbisogno || null, scadenza_offerte: scadenza || null });
        id = rfq.id;
        if (fornitori.size > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any).from("supplier_rfq_suppliers").insert(
            [...fornitori].map(supplier_id => ({ rfq_id: id, company_id: effectiveCompany.id, supplier_id })));
          if (error) toast.error("Richiesta creata, ma i fornitori non sono stati aggiunti");
        }
      }
      navigate(`/azienda/richieste-offerta/${id}`);
    } catch {
      // L'errore l'ha già detto la mutazione: la finestra resta aperta con quello che si è scritto.
    } finally {
      setOccupato(false);
    }
  };

  return (
    <Dialog open onOpenChange={aperto => { if (!aperto) onChiudi(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuova richiesta d’offerta</DialogTitle>
          <DialogDescription>Poi la invii e registri le offerte dalla pagina della richiesta.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Cosa ti serve</span>
            <Input value={titolo} onChange={e => setTitolo(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1 text-sm"><span className="font-medium">In cantiere entro</span>
              <Input type="date" value={fabbisogno} onChange={e => setFabbisogno(e.target.value)} /></label>
            <label className="block space-y-1 text-sm"><span className="font-medium">Risposta entro</span>
              <Input type="date" value={scadenza} onChange={e => setScadenza(e.target.value)} /></label>
          </div>
          <fieldset className="max-h-44 space-y-1 overflow-auto rounded border p-2">
            <legend className="px-1 text-sm font-medium">Articoli da chiedere</legend>
            {isLoading ? <p role="status" className="text-xs text-muted-foreground">Caricamento…</p>
              : daChiedere.length === 0 ? <p className="text-xs text-muted-foreground">Nessun articolo da comprare: le voci le scrivi nella richiesta.</p>
              : daChiedere.map(m => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={articoli.has(m.id)} onCheckedChange={() => setArticoli(inverti(articoli, m.id))} />
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{m.quantity} {m.unita_misura || "pz"}</span>
                </label>
              ))}
          </fieldset>
          <fieldset className="max-h-44 space-y-1 overflow-auto rounded border p-2">
            <legend className="px-1 text-sm font-medium">Fornitori a cui chiederla</legend>
            {suppliers.filter((s: { is_active?: boolean | null }) => s.is_active !== false).map((s: { id: string; name: string }) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={fornitori.has(s.id)} onCheckedChange={() => setFornitori(inverti(fornitori, s.id))} />
                <span className="min-w-0 truncate">{s.name}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onChiudi} disabled={occupato}>Annulla</Button>
          <Button onClick={() => void crea()} disabled={!titolo.trim() || occupato}>
            {occupato && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Crea richiesta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
