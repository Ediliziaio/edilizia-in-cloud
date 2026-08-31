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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Package, Loader2, AlertTriangle, HardHat, ArrowRight } from "lucide-react";

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
    mutationFn: async (supplierId: string) => {
      if (!effectiveCompany?.id) throw new Error("Azienda non disponibile");
      const gruppo = gruppi.find(([sid]) => sid === supplierId)?.[1] ?? [];
      if (gruppo.length === 0) throw new Error("Nessun articolo da ordinare per questo fornitore");

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
    onSuccess: ({ poId, n }, supplierId) => {
      queryClient.invalidateQueries({ queryKey: ["order-items", orderId] });
      queryClient.invalidateQueries({ queryKey: ["linked-purchase-orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["po-item-coverage-panel"] });
      toast.success(`OdA creato per ${supplierName(supplierId)} (${n} articoli)`, {
        action: { label: "Apri", onClick: () => navigate(`/azienda/ordini-acquisto/${poId}`) },
      });
    },
    onError: (e) => toast.error("Errore nella creazione dell'OdA", {
      description: e instanceof Error ? e.message : String(e),
    }),
    onSettled: () => setCreatingFor(null),
  });

  if (gruppi.length === 0 && senzaFornitore.length === 0) return null;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Package className="h-4 w-4 text-blue-600" />
        Da ordinare ai fornitori
      </div>
      <div className="space-y-1.5">
        {gruppi.map(([sid, gruppo]) => {
          const tot = gruppo.reduce((s, i) => s + (Number(i.purchase_price) || 0) * (Number(i.quantity) || 0), 0);
          return (
            <div key={sid} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2">
              <div className="min-w-0 text-sm">
                <span className="font-medium">{supplierName(sid)}</span>
                <span className="text-muted-foreground"> — {gruppo.length} {gruppo.length === 1 ? "articolo" : "articoli"} · {eur.format(tot)}</span>
                <div className="truncate text-xs text-muted-foreground">
                  {gruppo.map((i) => i.name).join(" · ")}
                </div>
              </div>
              <Button
                size="sm"
                className="shrink-0 gap-1.5"
                disabled={creaOda.isPending}
                onClick={() => { setCreatingFor(sid); creaOda.mutate(sid); }}
              >
                {creaOda.isPending && creatingFor === sid
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Package className="h-4 w-4" />}
                Crea OdA
              </Button>
            </div>
          );
        })}
        {senzaFornitore.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {senzaFornitore.length} {senzaFornitore.length === 1 ? "articolo senza fornitore" : "articoli senza fornitore"}: assegnalo (matita sulla riga) per poterli ordinare.
          </div>
        )}
      </div>
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
