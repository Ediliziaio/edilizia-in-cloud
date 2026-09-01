/**
 * Due pannelli che tolgono attrito al tab "Articoli e manodopera".
 *
 * 1) OrdinaPerFornitorePanel — "il contratto ha N articoli, li ordino a 2-3
 *    fornitori": il pannello raggruppa da solo gli articoli ancora da ordinare
 *    per fornitore e crea l'OdA con un click, righe collegate
 *    (purchase_order_items.order_item_id: e' il filo che alla ricezione genera
 *    il costo in automatico), stato degli articoli portato a "ordinato".
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

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" });

interface PanelItem {
  id?: string;
  name: string;
  quantity: number;
  purchase_price?: number;
  supplier_id?: string;
  vat_rate?: number;
  status?: string;
  stock_item_id?: string | null;
}

interface PanelProps {
  orderId: string;
  orderCode?: string | null;
  items: PanelItem[];
}

/** Copertura OdA per articolo: quali righe sono gia' dentro un ordine (non annullato). */
function useOdaCoverage(items: PanelItem[]) {
  const ids = items.filter((i) => i.id).map((i) => i.id!) as string[];
  return useQuery({
    queryKey: ["po-item-coverage-panel", ids.sort().join("|")],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("order_item_id, purchase_orders!inner(status)")
        .in("order_item_id", ids)
        .neq("purchase_orders.status", "annullato");
      if (error) return new Set();
      const linked = new Set<string>();
      (data ?? []).forEach((r) => { if (r.order_item_id) linked.add(r.order_item_id); });
      return linked;
    },
  });
}

export function OrdinaPerFornitorePanel({ orderId, orderCode, items }: PanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, effectiveCompany } = useAuth();
  const { suppliers } = useOperationalSuppliers();
  const { data: linked = new Set<string>() } = useOdaCoverage(items);
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

  // Da ordinare = ha un id, non viene dalla giacenza, non e' gia' in un OdA.
  const daOrdinare = useMemo(
    () => items.filter((i) => i.id && !i.stock_item_id && !linked.has(i.id)),
    [items, linked],
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

  const creaOda = useMutation({
    // soloSelezionati: true quando si arriva dal dialog (rispetta le spunte);
    // "Crea tutti" passa false e ordina i gruppi INTERI — cosi' una spunta
    // tolta in un dialog precedente non puo' filtrare di nascosto il bulk.
    mutationFn: async ({ supplierId, soloSelezionati }: { supplierId: string; soloSelezionati?: boolean }) => {
      if (!effectiveCompany?.id) throw new Error("Azienda non disponibile");
      let gruppo = gruppi.find(([sid]) => sid === supplierId)?.[1] ?? [];
      if (soloSelezionati) {
        gruppo = gruppo.filter((i) => selezione[i.id!] !== false);
      }
      if (gruppo.length === 0) throw new Error("Nessun articolo selezionato");

      const { data: po, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          company_id: effectiveCompany.id,
          supplier_id: supplierId,
          order_id: orderId,
          created_by: user?.id,
          notes: `Generato da commessa ${orderCode || orderId}`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select()
        .single();
      if (poErr) throw poErr;

      const { error: itemsErr } = await supabase.from("purchase_order_items").insert(
        gruppo.map((item, idx) => ({
          company_id: effectiveCompany.id,
          purchase_order_id: po.id,
          order_item_id: item.id!,
          description: item.name,
          quantity: item.quantity,
          unit_price: item.purchase_price || 0,
          vat_rate: item.vat_rate ?? 22,
          discount_percent: 0,
          unit_of_measure: "pz",
          sort_order: idx,
        })),
      );
      if (itemsErr) throw itemsErr;

      // Lo stato segue l'azione: prima restava "Da ordinare" e andava girato a
      // mano riga per riga (non tocca gli stati gia' avanzati, es. in_magazzino).
      await supabase
        .from("order_items")
        .update({ status: "ordinato" })
        .in("id", gruppo.map((i) => i.id!))
        .eq("status", "da_ordinare");

      void supabase.from("order_events" as never).insert({
        company_id: effectiveCompany.id,
        order_id: orderId,
        event_type: "ordine_fornitore_creato",
        payload: { po_id: po.id, supplier_id: supplierId, order_code: orderCode },
      } as never);

      return { poId: po.id as string, n: gruppo.length };
    },
    onSuccess: ({ poId, n }, { supplierId }) => {
      queryClient.invalidateQueries({ queryKey: ["order-items", orderId] });
      queryClient.invalidateQueries({ queryKey: ["linked-purchase-orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["po-item-coverage-panel"] });
      // Dentro "Crea tutti" il riepilogo lo fa il chiamante: un toast per
      // fornitore sarebbe una raffica.
      if (!creatingAll) {
        // Si atterra DENTRO l'ordine appena creato: il vecchio flusso faceva
        // cosi', e senza questa navigazione il click sembrava non fare nulla
        // (la riga sparisce dal pannello, ma e' un feedback troppo sottile).
        toast.success(`OdA creato per ${supplierName(supplierId)} (${n} articoli)`);
        navigate(`/azienda/ordini-acquisto/${poId}`);
      }
    },
    onError: (e) => toast.error("Errore nella creazione dell'OdA", {
      description: e instanceof Error ? e.message : String(e),
    }),
    onSettled: () => setCreatingFor(null),
  });

  /** Richiesta d'offerta al fornitore: testata + righe dagli articoli +
      fornitore invitato, poi si atterra nella RDO per completarla/inviarla.
      "Chiedere un preventivo e' un conto, fare l'ordine un altro". */
  const chiediPreventivo = async (supplierId: string) => {
    if (!effectiveCompany?.id) return;
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
      const { error: itErr } = await db.from("supplier_rfq_items").insert(
        gruppo.map((i, idx) => ({
          rfq_id: rfq.id,
          company_id: effectiveCompany.id,
          descrizione: i.name,
          quantita: i.quantity,
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

  if (gruppi.length === 0 && senzaFornitore.length === 0) return null;

  const totale = gruppi.reduce((s2, [, g]) =>
    s2 + g.reduce((x, i) => x + (Number(i.purchase_price) || 0) * (Number(i.quantity) || 0), 0), 0);
  const nArticoli = gruppi.reduce((s2, [, g]) => s2 + g.length, 0);

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Testata: il quadro e l'azione che risparmia piu' tempo. Prima erano
          quattro bottoni primari identici in colonna: nessuna gerarchia e
          nessun modo di ordinare tutto insieme. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Package className="h-4 w-4 shrink-0 text-blue-600" />
          <span className="font-semibold">Da ordinare ai fornitori</span>
          <span className="text-muted-foreground">
            {nArticoli} {nArticoli === 1 ? "articolo" : "articoli"} · {gruppi.length} {gruppi.length === 1 ? "fornitore" : "fornitori"} · <span className="tabular-nums">{eur.format(totale)}</span>
          </span>
        </div>
        {gruppi.length > 1 && (
          <Button size="sm" className="shrink-0 gap-1.5" disabled={creatingAll || creaOda.isPending} onClick={creaTutti}>
            {creatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            Crea tutti gli OdA ({gruppi.length})
          </Button>
        )}
      </div>

      {/* Una riga per fornitore: nome, articoli e totale sulla stessa linea,
          azione secondaria a destra. Il dettaglio delle righe sta gia'
          nell'elenco articoli qui sotto: non va ripetuto due volte. */}
      <div className="divide-y">
        {gruppi.map(([sid, gruppo]) => {
          const tot = gruppo.reduce((s2, i) => s2 + (Number(i.purchase_price) || 0) * (Number(i.quantity) || 0), 0);
          const busy = (creaOda.isPending && creatingFor === sid) || creatingAll;
          return (
            <div key={sid} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{supplierName(sid)}</span>
                <span className="text-muted-foreground"> · <span className="tabular-nums">{eur.format(tot)}</span></span>
                <span className="ml-2 hidden truncate text-xs text-muted-foreground sm:inline">
                  {gruppo.map((i) => i.name).join(" · ")}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                disabled={creaOda.isPending || creatingAll}
                onClick={() => {
                  const g = gruppi.find(([x]) => x === sid)?.[1] ?? [];
                  setSelezione(Object.fromEntries(g.map((i) => [i.id!, true])));
                  setSceltaPer(sid);
                }}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
                Ordina…
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
                    {scelti.length} di {gruppo.length} {gruppo.length === 1 ? "articolo" : "articoli"} · {eur.format(tot)}
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
                    Crea ordine (OdA)
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
