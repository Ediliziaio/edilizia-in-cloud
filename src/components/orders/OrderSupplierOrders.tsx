import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import { Truck, PackagePlus, Mail, Clock, AlertCircle } from "lucide-react";

/**
 * OrderSupplierOrders — "Ordini fornitore" della commessa.
 *
 * Passo 1 (sicuro, nessun invio): dagli articoli su misura con misure
 * CONFERMATE crea una bozza di proposed_purchase_order per fornitore
 * (raggruppando per supplier_id), pronta da inviare via Gmail (passo 2).
 *
 * L'invio via Gmail ufficiale (Gate 1) e il match risposta + AI#2 (Gate 2)
 * arrivano nei passi successivi: qui NON si invia nulla.
 *
 * Reso null se non ci sono articoli su misura né proposte → niente rumore.
 * Colonne spina/bridge non ancora nei tipi generati → client non tipizzato.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const PPO_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "Bozza", color: "bg-slate-100 text-slate-700 border-slate-300" },
  approved: { label: "Approvata", color: "bg-blue-100 text-blue-700 border-blue-300" },
  sent_to_supplier: { label: "Inviata al fornitore", color: "bg-indigo-100 text-indigo-700 border-indigo-300" },
  confirmed: { label: "Confermata", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  delivered: { label: "Consegnata", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  rejected: { label: "Rifiutata", color: "bg-red-100 text-red-700 border-red-300" },
  cancelled: { label: "Annullata", color: "bg-slate-100 text-slate-500 border-slate-300" },
};

interface ItemRow {
  id: string;
  name: string;
  quantity: number | null;
  unit_price: number | null;
  purchase_price: number | null;
  supplier_id: string | null;
  misure_rilevate: Record<string, number> | null;
  measure_status: string | null;
  suppliers: { name: string | null; email: string | null } | null;
}

interface PpoRow {
  id: string;
  status: string;
  total_amount_eur: number | null;
  items: unknown[] | null;
  created_at: string;
  sent_to_supplier_at: string | null;
  suppliers: { name: string | null } | null;
}

function measuresLabel(m: Record<string, number> | null): string {
  if (!m) return "";
  const parts = Object.entries(m).map(([k, v]) => `${k} ${v}`);
  return parts.join(" × ");
}

export function OrderSupplierOrders({ orderId }: { orderId: string }) {
  const qc = useQueryClient();

  const { data: order } = useQuery({
    queryKey: ["order-meta-for-procurement", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<{ company_id: string; order_code: string | null } | null> => {
      const { data, error } = await sb
        .from("orders")
        .select("company_id, order_code")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["order-procurement-items", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<ItemRow[]> => {
      const { data, error } = await sb
        .from("order_items")
        .select(
          "id, name, quantity, unit_price, purchase_price, supplier_id, misure_rilevate, measure_status, suppliers:supplier_id(name, email)",
        )
        .eq("order_id", orderId)
        .not("measure_status", "is", null)
        .order("position");
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  const { data: ppos } = useQuery({
    queryKey: ["order-supplier-ppos", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<PpoRow[]> => {
      const { data, error } = await sb
        .from("proposed_purchase_orders")
        .select(
          "id, status, total_amount_eur, items, created_at, sent_to_supplier_at, suppliers:proposed_supplier_id(name)",
        )
        .eq("for_cantiere_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PpoRow[];
    },
  });

  // Articoli pronti per l'ordine: misure CONFERMATE + fornitore assegnato.
  const { ready, missingSupplier } = useMemo(() => {
    const confirmed = (items ?? []).filter((i) => i.measure_status === "confermato");
    return {
      ready: confirmed.filter((i) => !!i.supplier_id),
      missingSupplier: confirmed.filter((i) => !i.supplier_id),
    };
  }, [items]);

  const createDrafts = useMutation({
    mutationFn: async () => {
      if (!order?.company_id) throw new Error("Commessa senza azienda");
      if (ready.length === 0) throw new Error("Nessun articolo confermato con fornitore");

      // Raggruppa per fornitore → una bozza ODA per fornitore.
      const bySupplier = new Map<string, ItemRow[]>();
      for (const it of ready) {
        const sid = it.supplier_id as string;
        if (!bySupplier.has(sid)) bySupplier.set(sid, []);
        bySupplier.get(sid)!.push(it);
      }

      const rows = Array.from(bySupplier.entries()).map(([supplierId, group]) => {
        const payloadItems = group.map((it) => ({
          name: it.name,
          qty: it.quantity ?? 1,
          unit: "pz",
          price_estimate: it.purchase_price ?? it.unit_price ?? 0,
          note: measuresLabel(it.misure_rilevate),
        }));
        const total = group.reduce(
          (s, it) => s + (it.purchase_price ?? it.unit_price ?? 0) * (it.quantity ?? 1),
          0,
        );
        return {
          company_id: order.company_id,
          proposed_supplier_id: supplierId,
          for_cantiere_id: orderId,
          items: payloadItems,
          proposal_reason: `Commessa ${order.order_code ?? ""} — misure confermate`.trim(),
          total_amount_eur: Math.round(total * 100) / 100,
          status: "draft",
          ai_persona_used: "acquisti",
        };
      });

      const { error } = await sb.from("proposed_purchase_orders").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["order-supplier-ppos", orderId] });
      toast.success(`${n} bozza/e ordine fornitore create`, {
        description: "Rivedi e invia via Gmail dal prossimo passo.",
      });
    },
    onError: (e) =>
      toast.error("Errore creazione ordine fornitore", { description: (e as Error).message }),
  });

  const hasContent = (items ?? []).length > 0 || (ppos ?? []).length > 0;
  if (!hasContent) return null; // commessa senza articoli su misura → niente rumore

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="h-4 w-4 text-orange-500" />
          Ordini fornitore
          {(ppos ?? []).length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({ppos!.length})</span>
          )}
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          disabled={ready.length === 0 || createDrafts.isPending}
          onClick={() => createDrafts.mutate()}
        >
          <PackagePlus className="mr-1 h-4 w-4" />
          Richiedi ordine fornitore
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {ready.length === 0 && (ppos ?? []).length === 0 && (
          <p className="flex items-start gap-2 py-1 text-xs text-muted-foreground">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Per richiedere un ordine: conferma le misure degli articoli e assegna a ciascuno un
            fornitore. {missingSupplier.length > 0 && `(${missingSupplier.length} confermati senza fornitore)`}
          </p>
        )}

        {ready.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {ready.length} articolo/i confermato/i pronto/i per l'ordine.
            {missingSupplier.length > 0 && ` ${missingSupplier.length} confermato/i senza fornitore (escluso/i).`}
          </p>
        )}

        {(ppos ?? []).length > 0 && (
          <ul className="divide-y">
            {ppos!.map((p) => {
              const cfg = PPO_STATUS[p.status] ?? PPO_STATUS.draft;
              const itemCount = Array.isArray(p.items) ? p.items.length : 0;
              return (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {p.suppliers?.name ?? "Fornitore"}
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
                        {cfg.label}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <span>{itemCount} articolo/i</span>
                      {p.total_amount_eur != null && <span>{formatCurrency(p.total_amount_eur)}</span>}
                      {p.sent_to_supplier_at && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> inviata
                        </span>
                      )}
                    </div>
                  </div>
                  {p.status === "draft" && (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" /> da inviare
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
