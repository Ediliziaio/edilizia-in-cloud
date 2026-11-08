/**
 * Le richieste d'offerta di una commessa, dentro «Materiali e acquisti». L'elenco e il dettaglio restano quelli di
 * /azienda/richieste-offerta: qui si vedono solo quelle della commessa e se ne crea una nuova già collegata.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useNavigaDocumento } from "@/lib/orders/documentoPopup";
import { ChevronDown, FileQuestion, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useAzioniMateriali, useMaterialiPerFase } from "@/hooks/useMaterialiPerFase";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { usePermissions } from "@/hooks/usePermissions";
import { useSupplierRfqs, type SupplierRfq } from "@/hooks/useSupplierRfqs";
import { supabase } from "@/integrations/supabase/client";
import { acquistabile } from "@/lib/distinta/statiFase";
import { formatCurrency } from "@/lib/formatters";
import { RDO_STATUS_COLORS, RDO_STATUS_LABELS } from "@/lib/rdoStatus";
import { cn } from "@/lib/utils";
import { ContatoriFiltro } from "./ContatoriFiltro";
import { RiquadroCommessa, TabellaCommessa, type ColonnaTabella } from "./TabellaCommessa";

const dataIt = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const conPlurale = (n: number, uno: string, tanti: string) => `${n} ${n === 1 ? uno : tanti}`;

export function OrderRichiesteOfferta({ orderId, orderCode }: { orderId: string; orderCode?: string | null }) {
  const perm = usePermissions();
  const { rfqs, contatori, isLoading, isError } = useSupplierRfqs();
  const [nuova, setNuova] = useState(false);
  const [filtro, setFiltro] = useState<string | null>(null);
  const puoCreare = !perm.solaLettura && (perm.canManagePurchasing || perm.canEditOrders || perm.isAdmin);
  const dellaCommessa = rfqs.filter(r => r.order_id === orderId);

  const aperte = ["bozza", "inviata", "in_valutazione"];
  const filtri: Record<string, (r: SupplierRfq) => boolean> = {
    aperte: (r) => aperte.includes(r.status),
    attesa: (r) => (contatori[r.id]?.inAttesa ?? 0) > 0,
    offerte: (r) => (contatori[r.id]?.risposte ?? 0) > 0,
    aggiudicate: (r) => r.status === "aggiudicata",
  };
  const conta = (chiave: string) => dellaCommessa.filter(filtri[chiave]).length;
  const visibili = filtro && filtri[filtro] && conta(filtro) > 0 ? dellaCommessa.filter(filtri[filtro]) : dellaCommessa;
  const colonne: ColonnaTabella<SupplierRfq>[] = [
    { titolo: "Numero", principale: true, cella: (r) => <Link to={`/azienda/richieste-offerta/${r.id}`} className="font-mono font-medium underline-offset-2 hover:underline">{r.rfq_number}</Link> },
    { titolo: "Data", cella: (r) => <span className="whitespace-nowrap">{dataIt(r.created_at)}</span> },
    { titolo: "Cosa serve", cella: (r) => <Link to={`/azienda/richieste-offerta/${r.id}`} className="underline-offset-2 hover:underline">{r.titolo}</Link> },
    { titolo: "Fornitori", cella: (r) => {
      const c = contatori[r.id];
      return c ? <div className="text-xs text-muted-foreground"><p className="whitespace-nowrap">{conPlurale(c.invitati, "fornitore", "fornitori")} · {conPlurale(c.risposte, "offerta", "offerte")}</p>{c.inAttesa > 0 && <p>{c.inAttesa} in attesa</p>}</div> : <span className="text-muted-foreground">—</span>;
    } },
    { titolo: "Stato", cella: (r) => (
      <Link to={`/azienda/richieste-offerta/${r.id}`} title="Apri per gestirla" aria-label={`Gestisci la richiesta ${r.rfq_number}`}>
        <Badge className={cn("whitespace-nowrap border-0 text-xs", RDO_STATUS_COLORS[r.status])}>{RDO_STATUS_LABELS[r.status] ?? r.status}<ChevronDown className="ml-1 h-3 w-3" aria-hidden="true" /></Badge>
      </Link>
    ) },
    { titolo: "Risposta entro", cella: (r) => <span className="whitespace-nowrap">{r.scadenza_offerte && r.status !== "aggiudicata" ? dataIt(r.scadenza_offerte) : "—"}</span> },
    ...(perm.canViewCosts ? [{ titolo: "Migliore offerta", destra: true, cella: (r: SupplierRfq) => <span className="font-medium" title="Migliore offerta">{contatori[r.id]?.migliore != null ? formatCurrency(contatori[r.id].migliore!) : "—"}</span> }] : []),
    { titolo: "Azioni", destra: true, cella: (r) => r.purchase_order_id ? <Link to={`/azienda/ordini-acquisto/${r.purchase_order_id}`} className="whitespace-nowrap text-xs underline underline-offset-2">Vedi l’ordine</Link> : null },
  ];

  return (
    <>
      <RiquadroCommessa
        icona={<FileQuestion className="h-5 w-5 text-primary" aria-hidden="true" />}
        titolo="Richieste d’offerta" conteggio={dellaCommessa.length}
        azioni={puoCreare ? <Button size="sm" onClick={() => setNuova(true)}><Plus className="mr-1.5 h-4 w-4" />Nuova richiesta</Button> : undefined}
        numeri={dellaCommessa.length > 0 ? (
          <ContatoriFiltro etichetta="Richieste per stato" attivo={filtro} onScegli={setFiltro} voci={[
            { chiave: "aperte", etichetta: "Aperte", valore: conta("aperte") },
            { chiave: "attesa", etichetta: "In attesa di risposta", valore: conta("attesa"), avviso: true },
            { chiave: "offerte", etichetta: "Con offerte", valore: conta("offerte") },
            { chiave: "aggiudicate", etichetta: "Aggiudicate", valore: conta("aggiudicate") },
          ]} />
        ) : undefined}
      >
        {isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">Caricamento…</p>
        ) : isError ? (
          <p role="alert" className="text-sm">Non riesco a leggere le richieste d’offerta.</p>
        ) : dellaCommessa.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna richiesta d’offerta per questa commessa.</p>
        ) : (
          <TabellaCommessa etichetta="Richieste d’offerta" colonne={colonne} righe={visibili} chiave={(r) => r.id} />
        )}
      </RiquadroCommessa>
      {nuova && <NuovaRichiesta orderId={orderId} orderCode={orderCode} onChiudi={() => setNuova(false)} />}
    </>
  );
}

function NuovaRichiesta({ orderId, orderCode, onChiudi }: { orderId: string; orderCode?: string | null; onChiudi: () => void }) {
  const navigate = useNavigaDocumento();
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
  const [cercaFornitore, setCercaFornitore] = useState("");
  const attivi = suppliers.filter((s: { is_active?: boolean | null }) => s.is_active !== false) as Array<{ id: string; name: string }>;

  // Solo ciò che si può davvero chiedere: materiali ancora da comprare, di fasi validate.
  // Una riga già chiesta a un fornitore si può chiedere a un altro: il doppione sullo stesso fornitore lo ferma il database.
  const daChiedere = useMemo(() => fasi.flatMap(f => acquistabile(f.validazione?.stato ?? null)
    ? f.materiali.filter(m => m.ordinabile) : []), [fasi]);

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
                  <span className="min-w-0 flex-1 truncate">{m.name}{m.supplier_rfq_item_id ? <span className="ml-1 text-xs text-amber-700">già chiesto</span> : null}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{m.quantity} {m.unita_misura || "pz"}</span>
                </label>
              ))}
          </fieldset>
          <fieldset className="space-y-1.5 rounded border p-2">
            <legend className="px-1 text-sm font-medium">Fornitori a cui chiederla{fornitori.size > 0 ? ` (${fornitori.size})` : ""}</legend>
            <Input aria-label="Cerca il fornitore" placeholder="Cerca il fornitore…" className="h-8" value={cercaFornitore} onChange={(e) => setCercaFornitore(e.target.value)} />
            <div className="max-h-40 space-y-1 overflow-auto">
              {attivi.filter((s) => s.name.toLowerCase().includes(cercaFornitore.trim().toLowerCase()) || fornitori.has(s.id)).map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={fornitori.has(s.id)} onCheckedChange={() => setFornitori(inverti(fornitori, s.id))} />
                  <span className="min-w-0 truncate">{s.name}</span>
                </label>
              ))}
            </div>
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
