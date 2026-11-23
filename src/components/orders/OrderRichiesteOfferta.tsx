/**
 * Le richieste d'offerta di una commessa, dentro «Materiali e acquisti». L'elenco e il dettaglio restano quelli di
 * /azienda/richieste-offerta: qui si vedono solo quelle della commessa e se ne crea una nuova già collegata.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { rfqKeys, useSupplierRfqs, type SupplierRfq } from "@/hooks/useSupplierRfqs";
import { supabase } from "@/integrations/supabase/client";
import { acquistabile } from "@/lib/distinta/statiFase";
import { formatCurrency } from "@/lib/formatters";
import { RDO_STATUS_COLORS, RDO_STATUS_LABELS } from "@/lib/rdoStatus";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { ContatoriFiltro } from "./ContatoriFiltro";
import { RiquadroCommessa, TabellaCommessa, type ColonnaTabella } from "./TabellaCommessa";

const dataIt = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export function OrderRichiesteOfferta({ orderId, orderCode, commesse }: {
  orderId: string;
  orderCode?: string | null;
  commesse?: readonly { id: string; codice: string | null; nome: string }[];
}) {
  const t = useT();
  const perm = usePermissions();
  const { rfqs, contatori, isLoading, isError } = useSupplierRfqs();
  const [nuova, setNuova] = useState(false);
  const [filtro, setFiltro] = useState<string | null>(null);
  const puoCreare = !perm.solaLettura && (perm.canManagePurchasing || perm.canEditOrders || perm.isAdmin);
  const commessePerId = commesse && new Map(commesse.map(c => [c.id, c]));
  const dellaCommessa = rfqs.filter(r => commessePerId ? !!r.order_id && commessePerId.has(r.order_id) : r.order_id === orderId);

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
    { titolo: t("Numero"), principale: true, cella: (r) => <Link to={`/azienda/richieste-offerta/${r.id}`} className="font-mono font-medium underline-offset-2 hover:underline">{r.rfq_number}</Link> },
    ...(commessePerId ? [{ titolo: t("Commessa"), cella: (r: SupplierRfq) => {
      const c = commessePerId.get(r.order_id ?? "");
      return c ? <span title={c.nome}>{c.codice ?? c.nome}</span> : "—";
    } }] : []),
    { titolo: t("Data"), cella: (r) => <span className="whitespace-nowrap">{dataIt(r.created_at)}</span> },
    { titolo: t("Cosa serve"), cella: (r) => <Link to={`/azienda/richieste-offerta/${r.id}`} className="underline-offset-2 hover:underline">{r.titolo}</Link> },
    { titolo: t("Fornitori"), cella: (r) => {
      const c = contatori[r.id];
      return c ? <div className="text-xs text-muted-foreground"><p className="whitespace-nowrap">{t(c.invitati === 1 ? "{n} fornitore" : "{n} fornitori", { n: c.invitati })} · {t(c.risposte === 1 ? "{n} offerta" : "{n} offerte", { n: c.risposte })}</p>{c.inAttesa > 0 && <p>{t("{n} in attesa", { n: c.inAttesa })}</p>}</div> : <span className="text-muted-foreground">—</span>;
    } },
    { titolo: t("Stato"), cella: (r) => (
      <Link to={`/azienda/richieste-offerta/${r.id}`} title={t("Apri per gestirla")} aria-label={t("Gestisci la richiesta {numero}", { numero: r.rfq_number })}>
        <Badge className={cn("whitespace-nowrap border-0 text-xs", RDO_STATUS_COLORS[r.status])}>{RDO_STATUS_LABELS[r.status] ? t(RDO_STATUS_LABELS[r.status]) : r.status}<ChevronDown className="ml-1 h-3 w-3" aria-hidden="true" /></Badge>
      </Link>
    ) },
    { titolo: t("Risposta entro"), cella: (r) => <span className="whitespace-nowrap">{r.scadenza_offerte && r.status !== "aggiudicata" ? dataIt(r.scadenza_offerte) : "—"}</span> },
    ...(perm.canViewCosts ? [{ titolo: t("Migliore offerta"), destra: true, cella: (r: SupplierRfq) => <span className="font-medium" title={t("Migliore offerta")}>{contatori[r.id]?.migliore != null ? formatCurrency(contatori[r.id].migliore!) : "—"}</span> }] : []),
    { titolo: t("Azioni"), destra: true, senzaEtichetta: true, cella: (r) => r.purchase_order_id ? <Link to={`/azienda/ordini-acquisto/${r.purchase_order_id}`} className="whitespace-nowrap text-xs underline underline-offset-2">{t("Vedi l’ordine")}</Link> : null },
  ];

  return (
    <>
      <RiquadroCommessa
        icona={<FileQuestion className="h-5 w-5 text-primary" aria-hidden="true" />}
        titolo={t("Richieste d’offerta")} conteggio={dellaCommessa.length}
        azioni={puoCreare ? <Button size="sm" onClick={() => setNuova(true)}><Plus className="mr-1.5 h-4 w-4" />{commesse ? t("Nuova richiesta sulla generale") : t("Nuova richiesta")}</Button> : undefined}
        numeri={dellaCommessa.length > 0 ? (
          <ContatoriFiltro etichetta={t("Richieste per stato")} attivo={filtro} onScegli={setFiltro} voci={[
            { chiave: "aperte", etichetta: t("Aperte"), valore: conta("aperte") },
            { chiave: "attesa", etichetta: t("In attesa di risposta"), valore: conta("attesa"), avviso: true },
            { chiave: "offerte", etichetta: t("Con offerte"), valore: conta("offerte") },
            { chiave: "aggiudicate", etichetta: t("Aggiudicate"), valore: conta("aggiudicate") },
          ]} />
        ) : undefined}
      >
        {isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">{t("Caricamento…")}</p>
        ) : isError ? (
          <p role="alert" className="text-sm">{t("Non riesco a leggere le richieste d’offerta.")}</p>
        ) : dellaCommessa.length === 0 ? (
          <p className="text-sm text-muted-foreground">{commesse ? t("Nessuna richiesta d’offerta sull’operazione.") : t("Nessuna richiesta d’offerta per questa commessa.")}</p>
        ) : (
          <TabellaCommessa etichetta={t("Richieste d’offerta")} colonne={colonne} righe={visibili} chiave={(r) => r.id} />
        )}
      </RiquadroCommessa>
      {nuova && <NuovaRichiesta orderId={orderId} orderCode={orderCode} onChiudi={() => setNuova(false)} />}
    </>
  );
}

function NuovaRichiesta({ orderId, orderCode, onChiudi }: { orderId: string; orderCode?: string | null; onChiudi: () => void }) {
  const t = useT();
  const navigate = useNavigaDocumento();
  const qc = useQueryClient();
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
          if (error) toast.error(t("Richiesta creata, ma la data in cantiere non è stata salvata"));
        }
      } else {
        const rfq = await create.mutateAsync({ titolo: titolo.trim(), order_id: orderId, data_fabbisogno: fabbisogno || null, scadenza_offerte: scadenza || null });
        id = rfq.id;
        if (fornitori.size > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any).from("supplier_rfq_suppliers").insert(
            [...fornitori].map(supplier_id => ({ rfq_id: id, company_id: effectiveCompany.id, supplier_id })));
          if (error) toast.error(t("Richiesta creata, ma i fornitori non sono stati aggiunti"));
          else void qc.invalidateQueries({ queryKey: rfqKeys.all });
        }
      }
      onChiudi();
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
          <DialogTitle>{t("Nuova richiesta d’offerta")}</DialogTitle>
          <DialogDescription>{orderCode && `${t("Commessa {codice}.", { codice: orderCode })} `}{t("Invio e registrazione delle offerte si gestiscono dalla pagina della richiesta.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{t("Cosa ti serve")}</span>
            <Input value={titolo} onChange={e => setTitolo(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1 text-sm"><span className="font-medium">{t("In cantiere entro")}</span>
              <Input type="date" value={fabbisogno} onChange={e => setFabbisogno(e.target.value)} /></label>
            <label className="block space-y-1 text-sm"><span className="font-medium">{t("Risposta entro")}</span>
              <Input type="date" value={scadenza} onChange={e => setScadenza(e.target.value)} /></label>
          </div>
          <fieldset className="max-h-44 space-y-1 overflow-auto rounded border p-2">
            <legend className="px-1 text-sm font-medium">{t("Articoli da chiedere")}</legend>
            {isLoading ? <p role="status" className="text-xs text-muted-foreground">{t("Caricamento…")}</p>
              : daChiedere.length === 0 ? <p className="text-xs text-muted-foreground">{t("Nessun articolo da comprare: le voci le scrivi nella richiesta.")}</p>
              : daChiedere.map(m => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={articoli.has(m.id)} onCheckedChange={() => setArticoli(inverti(articoli, m.id))} />
                  <span className="min-w-0 flex-1 truncate">{m.name}{m.supplier_rfq_item_id ? <span className="ml-1 text-xs text-amber-700">{t("già chiesto")}</span> : null}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{m.quantity} {m.unita_misura || t("pz")}</span>
                </label>
              ))}
          </fieldset>
          <fieldset className="space-y-1.5 rounded border p-2">
            <legend className="px-1 text-sm font-medium">{t("Fornitori a cui chiederla")}{fornitori.size > 0 ? ` (${fornitori.size})` : ""}</legend>
            <Input aria-label={t("Cerca il fornitore")} placeholder={t("Cerca il fornitore…")} className="h-8" value={cercaFornitore} onChange={(e) => setCercaFornitore(e.target.value)} />
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
          <Button variant="ghost" onClick={onChiudi} disabled={occupato}>{t("Annulla")}</Button>
          <Button onClick={() => void crea()} disabled={!titolo.trim() || occupato}>
            {occupato && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("Crea richiesta")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
