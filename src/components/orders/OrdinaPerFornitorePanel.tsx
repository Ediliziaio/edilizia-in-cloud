/**
 * Due pannelli che tolgono attrito al tab "Articoli e manodopera".
 *
 * 1) OrdinaPerFornitorePanel — "il contratto ha N articoli, li ordino a 2-3
 *    fornitori": il pannello raggruppa da solo gli articoli ancora da ordinare
 *    per fornitore e crea l'OdA con un click, righe collegate
 *    (purchase_order_items.order_item_id: e' il filo che alla ricezione genera
 *    il costo in automatico). La creazione prepara una bozza: non cambia
 *    lo stato dell'articolo in "ordinato" prima dell'effettiva emissione.
 *    Prima: dialog cieco in fondo al tab, articoli senza fornitore infilati in
 *    OGNI OdA, gia'-ordinati riproposti, stato da girare a mano riga per riga.
 *
 * 2) PosaInLavorazioniBanner — quando fra gli articoli ci sono righe che sono
 *    manodopera (posa, montaggio, installazione: tipico import dal preventivo)
 *    il banner propone di spostarle nelle Lavorazioni, dove i conti le
 *    contano. Lasciate fra gli articoli, il Conto economico segnava "mancano i
 *    costi manodopera" mentre i soldi c'erano — nel posto sbagliato.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Package, Loader2, AlertTriangle, HardHat, ArrowRight, FileQuestion } from "lucide-react";
import { useMaterialProcurement, useUnmappedPurchaseOrders } from "@/hooks/useMaterialProcurement";
import { refreshMaterialQueries } from "@/lib/orders/refreshMaterialQueries";
import { pendingMaterials, planMaterial, type ProcurementItem } from "@/lib/orders/materialProcurement";
import { createMaterialPurchaseOrder, IncompletePurchaseOrderError } from "@/lib/orders/createMaterialPurchaseOrder";
import { usePermissions } from "@/hooks/usePermissions";

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: true });

type PanelItem = ProcurementItem;

interface PanelProps {
  orderId: string;
  orderCode?: string | null;
  items: PanelItem[];
}

export function OrdinaPerFornitorePanel({ orderId, orderCode, items }: PanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, effectiveCompany } = useAuth();
  const { suppliers } = useOperationalSuppliers();
  const coverage = useMaterialProcurement(items);
  const unmapped = useUnmappedPurchaseOrders(orderId);
  const blockedSuppliers = new Set((unmapped.data ?? []).map(o => o.supplier_id));
  const { canEditOrders, canViewCosts } = usePermissions();
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [creatingAll, setCreatingAll] = useState(false);
  /** Fornitore per cui e' aperto il dialog di scelta Preventivo/Ordine. */
  const [sceltaPer, setSceltaPer] = useState<string | null>(null);
  /** Spunte per articolo nel dialog: si puo' ordinare (o chiedere il
      preventivo per) SOLO una parte del gruppo — le finestre subito, le
      zanzariere piu' avanti. Default: tutto selezionato. */
  const [selezione, setSelezione] = useState<Record<string, boolean>>({});
  const [rdoBusy, setRdoBusy] = useState(false);

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "Fornitore";

  // Drafts reserve quantity; partial orders leave only their residual demand.
  const daOrdinare = useMemo(
    () => pendingMaterials(items, coverage.data ?? []),
    [items, coverage.data],
  );
  const gruppi = useMemo(() => {
    const map = new Map<string, PanelItem[]>();
    for (const i of daOrdinare) {
      if (!i.supplier_id) continue;
      map.set(i.supplier_id, [...(map.get(i.supplier_id) ?? []), i]);
    }
    return [...map.entries()];
  }, [daOrdinare]);
  const senzaFornitore = daOrdinare.filter((i) => !i.supplier_id);
  const daVerificare = items.map(i => planMaterial(i, coverage.data ?? [])).filter(p => p.review || p.overOrdered);

  const creaOda = useMutation({
    // soloSelezionati: true quando si arriva dal dialog (rispetta le spunte);
    // "Crea tutti" passa false e ordina i gruppi INTERI — cosi' una spunta
    // tolta in un dialog precedente non puo' filtrare di nascosto il bulk.
    mutationFn: async ({ supplierId, soloSelezionati }: { supplierId: string; soloSelezionati?: boolean }) => {
      if (!effectiveCompany?.id) throw new Error("Azienda non disponibile");
      if (!canEditOrders || !canViewCosts) throw new Error("Permessi insufficienti");
      let gruppo = gruppi.find(([sid]) => sid === supplierId)?.[1] ?? [];
      if (soloSelezionati) {
        gruppo = gruppo.filter((i) => selezione[i.id!] !== false);
      }
      if (gruppo.length === 0) throw new Error("Nessun articolo selezionato");

      return createMaterialPurchaseOrder({ companyId: effectiveCompany.id, orderId, orderCode, supplierId, userId: user?.id, items: gruppo });
    },
    onSuccess: ({ poId, n }, { supplierId }) => {
      queryClient.invalidateQueries({ queryKey: ["order-items", orderId] });
      queryClient.invalidateQueries({ queryKey: ["linked-purchase-orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["material-procurement"] });
      // Dentro "Crea tutti" il riepilogo lo fa il chiamante: un toast per
      // fornitore sarebbe una raffica.
      if (!creatingAll) {
        // Si atterra DENTRO l'ordine appena creato: il vecchio flusso faceva
        // cosi', e senza questa navigazione il click sembrava non fare nulla
        // (la riga sparisce dal pannello, ma e' un feedback troppo sottile).
        toast.success(`Bozza OdA creata per ${supplierName(supplierId)} (${n} articoli)`);
        navigate(`/azienda/ordini-acquisto/${poId}`);
      }
    },
    onError: (e) => toast.error("Errore nella creazione dell'OdA", {
      description: e instanceof Error ? e.message : String(e),
      action: e instanceof IncompletePurchaseOrderError ? { label: "Verifica bozza", onClick: () => navigate(`/azienda/ordini-acquisto/${e.poId}`) } : undefined,
    }),
    onSettled: () => {
      setCreatingFor(null);
      refreshMaterialQueries(queryClient);
    },
  });

  /** Richiesta d'offerta al fornitore: testata + righe dagli articoli +
      fornitore invitato, poi si atterra nella RDO per completarla/inviarla.
      "Chiedere un preventivo e' un conto, fare l'ordine un altro". */
  const chiediPreventivo = async (supplierId: string) => {
    if (!effectiveCompany?.id || !canEditOrders || !canViewCosts) return;
    setRdoBusy(true);
    try {
      // Si arriva qui solo dal dialog: le spunte valgono sempre.
      const gruppo = (gruppi.find(([sid]) => sid === supplierId)?.[1] ?? [])
        .filter((i) => selezione[i.id!] !== false);
      if (gruppo.length === 0) throw new Error("Nessun articolo selezionato");
      const user = (await supabase.auth.getUser()).data.user;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data: rfq, error: rfqErr } = await db.from("supplier_rfqs").insert({
        company_id: effectiveCompany.id,
        titolo: `Preventivo ${supplierName(supplierId)} — ${orderCode || "commessa"}`,
        order_id: orderId,
        created_by: user?.id,
      }).select().single();
      if (rfqErr) throw rfqErr;
      const righeRdo = gruppo.flatMap((i) =>
        i.posizioni && i.posizioni.length > 0
          ? i.posizioni.map((po) => ({
              descrizione: `${i.name} — ${po.descrizione}${po.misure ? ` ${po.misure}` : ""}`,
              quantita: po.quantita,
            }))
          : [{ descrizione: i.name, quantita: i.quantity }],
      );
      const { error: itErr } = await db.from("supplier_rfq_items").insert(
        righeRdo.map((r, idx) => ({
          rfq_id: rfq.id,
          company_id: effectiveCompany.id,
          ...r,
          unita_misura: "pz",
          posizione: idx,
        })),
      );
      if (itErr) throw itErr;
      const { error: supErr } = await db.from("supplier_rfq_suppliers").insert({
        rfq_id: rfq.id, company_id: effectiveCompany.id, supplier_id: supplierId,
      });
      if (supErr) throw supErr;
      toast.success(`Richiesta d'offerta creata per ${supplierName(supplierId)}`);
      setSceltaPer(null);
      navigate(`/azienda/richieste-offerta/${rfq.id}`);
    } catch (e) {
      toast.error("Errore nella richiesta d'offerta", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRdoBusy(false);
    }
  };

  const creaTutti = async () => {
    setCreatingAll(true);
    let ok = 0, ko = 0;
    // In sequenza, non in parallelo: la numerazione OdA e' un contatore seriale.
    for (const [sid] of gruppi) {
      try { await creaOda.mutateAsync({ supplierId: sid }); ok++; } catch { ko++; }
    }
    setCreatingAll(false);
    if (ok > 0) toast.success(`${ok} OdA creati, uno per fornitore`, {
      action: { label: "Vedi OdA", onClick: () => navigate("/azienda/ordini-acquisto") },
    });
    if (ko > 0) toast.error(`${ko} OdA non creati: riprova dai singoli fornitori`);
  };

  if (!items.length) return null;
  if (coverage.isPending || unmapped.isPending) return <p role="status" className="text-sm text-muted-foreground">Verifica ordini e quantità in corso…</p>;
  if (coverage.isError || unmapped.isError) return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 p-4 text-sm">
    Impossibile verificare gli acquisti già collegati. Creazione OdA sospesa per evitare duplicati.
    <Button variant="outline" size="sm" onClick={() => { coverage.refetch(); unmapped.refetch(); }} disabled={coverage.isFetching || unmapped.isFetching}>Riprova</Button>
  </div>;
  if (gruppi.length === 0 && senzaFornitore.length === 0 && daVerificare.length === 0 && !unmapped.data?.length) return null;

  const pronti = gruppi.filter(([sid]) => !blockedSuppliers.has(sid));
  const totale = pronti.reduce((s2, [, g]) =>
    s2 + g.reduce((x, i) => x + (Number(i.purchase_price) || 0) * (Number(i.quantity) || 0), 0), 0);
  const nArticoli = pronti.reduce((s2, [, g]) => s2 + g.length, 0);

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Testata: il quadro e l'azione che risparmia piu' tempo. Prima erano
          quattro bottoni primari identici in colonna: nessuna gerarchia e
          nessun modo di ordinare tutto insieme. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Package className="h-4 w-4 shrink-0 text-blue-600" />
          <span className="font-semibold">Acquisti per fornitore</span>
          <span className="text-muted-foreground">
            {nArticoli} {nArticoli === 1 ? "articolo pronto" : "articoli pronti"} · {pronti.length} {pronti.length === 1 ? "fornitore" : "fornitori"}{canViewCosts && <> · <span className="tabular-nums">{eur.format(totale)} + IVA</span></>}
          </span>
        </div>
        {gruppi.length > 1 && canEditOrders && canViewCosts && !gruppi.some(([sid]) => blockedSuppliers.has(sid)) && (
          <Button size="sm" className="shrink-0 gap-1.5" disabled={creatingAll || creaOda.isPending} onClick={creaTutti}>
            {creatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            Prepara tutte le bozze ({gruppi.length})
          </Button>
        )}
      </div>

      {/* Una riga per fornitore: nome, articoli e totale sulla stessa linea,
          azione secondaria a destra. Il dettaglio delle righe sta gia'
          nell'elenco articoli qui sotto: non va ripetuto due volte. */}
      <div className="divide-y">
        {!!unmapped.data?.length && <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 space-y-2 text-sm">
          <p className="font-medium">Ordini da riconciliare con gli articoli</p>
          <p className="text-xs text-muted-foreground">Questi OdA contengono righe non collegate o sono vuoti. Verificali prima di creare altri ordini allo stesso fornitore: le quantità residue potrebbero essere già coperte.</p>
          <div className="flex flex-wrap gap-2">{unmapped.data.map(o => <Button key={o.id} size="sm" variant="outline" onClick={() => navigate(`/azienda/ordini-acquisto/${o.id}`)}>Apri {o.oda_number}</Button>)}</div>
        </div>}
        {gruppi.map(([sid, gruppo]) => {
          const tot = gruppo.reduce((s2, i) => s2 + (Number(i.purchase_price) || 0) * (Number(i.quantity) || 0), 0);
          const busy = (creaOda.isPending && creatingFor === sid) || creatingAll;
          return (
            <div key={sid} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{supplierName(sid)}</span>
                {canViewCosts && <span className="text-muted-foreground"> · <span className="tabular-nums">{eur.format(tot)} + IVA</span></span>}
                <span className="ml-2 hidden truncate text-xs text-muted-foreground sm:inline">
                  {gruppo.map((i) => i.name).join(" · ")}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                disabled={!canEditOrders || !canViewCosts || blockedSuppliers.has(sid) || creaOda.isPending || creatingAll}
                onClick={() => {
                  const g = gruppi.find(([x]) => x === sid)?.[1] ?? [];
                  setSelezione(Object.fromEntries(g.map((i) => [i.id!, true])));
                  setSceltaPer(sid);
                }}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
                Prepara acquisto…
              </Button>
            </div>
          );
        })}
        {senzaFornitore.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50/60 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {senzaFornitore.length} {senzaFornitore.length === 1 ? "articolo senza fornitore" : "articoli senza fornitore"}: assegnalo (matita sulla riga) per poterli ordinare.
          </div>
        )}
        {daVerificare.length > 0 && <div className="px-3 py-3 text-sm bg-amber-50/60 dark:bg-amber-950/20">
          <p className="font-medium">Da verificare prima di acquistare</p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">{daVerificare.map(p => <li key={p.item.id ?? p.item.name}>{p.item.name}: {p.review ?? "quantità in OdA superiore al previsto"}.</li>)}</ul>
        </div>}
      </div>

      {/* La scelta che prima non c'era: chiedere un preventivo e' un conto,
          fare l'ordine un altro. Il dialog mostra cosa entra e offre le due
          strade — la RDO usa l'area Richieste d'offerta gia' esistente. */}
      <Dialog open={!!sceltaPer} onOpenChange={(v) => { if (!v) setSceltaPer(null); }}>
        <DialogContent className="sm:max-w-md">
          {sceltaPer && (() => {
            const gruppo = gruppi.find(([sid]) => sid === sceltaPer)?.[1] ?? [];
            const scelti = gruppo.filter((i) => selezione[i.id!] !== false);
            const tot = scelti.reduce((s2, i) => s2 + (Number(i.purchase_price) || 0) * (Number(i.quantity) || 0), 0);
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{supplierName(sceltaPer)}</DialogTitle>
                  <DialogDescription>
                    {scelti.length} di {gruppo.length} {gruppo.length === 1 ? "articolo" : "articoli"} · {eur.format(tot)} + IVA. Solo le quantità ancora da acquistare; le bozze esistenti sono già considerate. Nessun invio automatico al fornitore.
                  </DialogDescription>
                </DialogHeader>
                {/* Spunte per articolo: si puo' ordinare solo una parte del
                    gruppo (le finestre subito, le zanzariere dopo). Il resto
                    resta nel pannello, pronto per il giro successivo. */}
                <ul className="max-h-44 space-y-1 overflow-y-auto text-sm">
                  {gruppo.map((i) => {
                    const on = selezione[i.id!] !== false;
                    return (
                      <li key={i.id}>
                        <label className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 ${on ? "" : "opacity-50"}`}>
                          <span className="flex min-w-0 items-center gap-2">
                            <Checkbox
                              checked={on}
                              onCheckedChange={(v) => setSelezione((prev) => ({ ...prev, [i.id!]: v === true }))}
                            />
                            <span className="min-w-0 truncate">{i.name}{i.quantity > 1 ? ` ×${i.quantity}` : ""}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {eur.format((Number(i.purchase_price) || 0) * (Number(i.quantity) || 0))}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <DialogFooter className="flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    disabled={rdoBusy || creaOda.isPending || scelti.length === 0}
                    onClick={() => chiediPreventivo(sceltaPer)}
                  >
                    {rdoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileQuestion className="h-4 w-4" />}
                    Chiedi preventivo (RDO)
                  </Button>
                  <Button
                    className="gap-1.5"
                    disabled={rdoBusy || creaOda.isPending || scelti.length === 0}
                    onClick={() => { setCreatingFor(sceltaPer); setSceltaPer(null); creaOda.mutate({ supplierId: sceltaPer, soloSelezionati: true }); }}
                  >
                    {creaOda.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                    Crea bozza OdA
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Posa fra gli articoli → Lavorazioni
═══════════════════════════════════════════════════════════════════════════ */

const POSA_PATTERN = /manodopera|\bposa\b|installazion|montaggio/i;

interface BannerProps {
  orderId: string;
  items: PanelItem[];
}

export function PosaInLavorazioniBanner({ orderId, items }: BannerProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [teamByItem, setTeamByItem] = useState<Record<string, string>>({});
  const [moving, setMoving] = useState(false);
  const { effectiveCompany } = useAuth();

  // Candidate: righe che nel NOME dicono di essere manodopera e non vengono
  // dalla giacenza. Il pattern e' volutamente stretto: meglio non proporre che
  // proporre male.
  const candidati = useMemo(
    () => items.filter((i) => i.id && !i.stock_item_id && POSA_PATTERN.test(i.name)),
    [items],
  );

  const { data: teams = [] } = useQuery({
    queryKey: ["external-teams-lite", effectiveCompany?.id],
    enabled: open && !!effectiveCompany?.id,
    staleTime: 300_000,
    queryFn: async (): Promise<Array<{ id: string; name: string | null }>> => {
      const { data } = await supabase
        .from("external_teams")
        .select("id, name")
        .eq("company_id", effectiveCompany!.id)
        .order("name");
      return data ?? [];
    },
  });

  if (candidati.length === 0) return null;

  const sposta = async () => {
    setMoving(true);
    try {
      for (const item of candidati) {
        const teamId = teamByItem[item.id!];
        if (!teamId) continue; // si spostano solo le righe con la squadra scelta
        const costo = (Number(item.purchase_price) || 0) * (Number(item.quantity) || 0);
        const { error: insErr } = await supabase.from("order_external_teams").insert({
          order_id: orderId,
          external_team_id: teamId,
          total_cost: costo,
          cost_preventivo: costo,
          vat_rate: item.vat_rate ?? 22,
          is_paid: false,
          notes: `Da articolo: ${item.name}`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        if (insErr) throw insErr;
        const { error: delErr } = await supabase.from("order_items").delete().eq("id", item.id!);
        if (delErr) throw delErr;
      }
      queryClient.invalidateQueries({ queryKey: ["order-items", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-external-teams", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-work-phases", orderId] });
      toast.success("Posa spostata nelle Lavorazioni");
      setOpen(false);
    } catch (e) {
      toast.error("Errore nello spostamento", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setMoving(false);
    }
  };

  const pronte = candidati.filter((i) => teamByItem[i.id!]).length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20">
        <div className="flex min-w-0 items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
          <HardHat className="h-4 w-4 shrink-0" />
          <span className="line-clamp-2">
            {candidati.length === 1
              ? `"${candidati[0].name}" sembra manodopera: fra gli articoli il suo costo non entra nei conti della manodopera.`
              : `${candidati.length} articoli sembrano manodopera: fra gli articoli il loro costo non entra nei conti della manodopera.`}
          </span>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 gap-1.5 border-amber-400" onClick={() => setOpen(true)}>
          Sposta nelle Lavorazioni <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sposta la posa nelle Lavorazioni</DialogTitle>
            <DialogDescription>
              Scegli chi la esegue: la riga esce dagli articoli ed entra nella manodopera
              con il suo costo ({"a corpo"}). Cosi' il Conto economico la conta dove deve.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {candidati.map((item) => (
              <div key={item.id} className="space-y-1.5 rounded-md border p-2.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{item.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {eur.format((Number(item.purchase_price) || 0) * (Number(item.quantity) || 0))}
                  </span>
                </div>
                <Select
                  value={teamByItem[item.id!] ?? ""}
                  onValueChange={(v) => setTeamByItem((prev) => ({ ...prev, [item.id!]: v }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Squadra / subappaltatore…" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Nessuna squadra: creane una in Subappaltatori
                      </div>
                    ) : teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name ?? "Squadra"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
            <Button onClick={sposta} disabled={moving || pronte === 0} className="gap-1.5">
              {moving && <Loader2 className="h-4 w-4 animate-spin" />}
              Sposta {pronte > 0 ? `(${pronte})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
