/**
 * Storico di un articolo di magazzino: i movimenti, e — per chi può vedere i costi —
 * com'è andato il prezzo d'acquisto nel tempo.
 *
 * L'andamento viene da `magazzino_andamento_prezzo`, che per ogni carico dà il prezzo
 * pagato, il costo medio della giacenza di allora e se quel carico fu segnalato come
 * rincaro. Serve a vedere il rincaro, non solo a esserne avvisati: l'avviso è un
 * riepilogo mensile, qui c'è la storia riga per riga.
 *
 * Se la funzione non c'è ancora (migrazione non applicata) o l'utente non può vedere i
 * costi, la sezione semplicemente non compare: niente errori a schermo.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StockItem } from "@/types/warehouse";

interface RigaAndamento {
  movement_id: string;
  quando: string;
  quantita: number;
  prezzo_pagato: number;
  medio_prima: number | null;
  scostamento_perc: number | null;
  spesa_in_piu: number | null;
  e_rincaro: boolean;
  note: string | null;
}

interface StockMovementHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: StockItem | null;
}

export function StockMovementHistoryDialog({
  open,
  onOpenChange,
  item,
}: StockMovementHistoryDialogProps) {
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["stock-movements", item?.id],
    queryFn: async () => {
      if (!item) return [];
      const { data, error } = await supabase
        .from("warehouse_movements")
        .select(`
          id, movement_type, quantity, notes, created_at, performed_by,
          order_item_id
        `)
        .eq("stock_item_id", item.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch linked order info for movements with order_item_id
      const orderItemIds = data
        .filter((m) => m.order_item_id)
        .map((m) => m.order_item_id!);

      const orderMap: Record<string, string> = {};
      if (orderItemIds.length > 0) {
        const { data: orderItems } = await supabase
          .from("order_items")
          .select("id, order_id, order:orders(order_code)")
          .in("id", orderItemIds);

        if (orderItems) {
          for (const oi of orderItems) {
            const orderCode = (oi as any).order?.order_code;
            orderMap[oi.id] = orderCode || oi.order_id.slice(0, 8);
          }
        }
      }

      return data.map((m) => ({
        ...m,
        orderCode: m.order_item_id ? orderMap[m.order_item_id] || "—" : null,
      }));
    },
    enabled: !!item && open,
  });

  // Andamento del prezzo d'acquisto. Fallimento silenzioso: la sezione non compare.
  const { data: andamento = [] } = useQuery({
    queryKey: ["stock-andamento-prezzo", item?.id],
    enabled: !!item && open,
    queryFn: async (): Promise<RigaAndamento[]> => {
      if (!item) return [];
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc("magazzino_andamento_prezzo", {
          p_stock_item_id: item.id,
          p_limite: 60,
        });
        if (error) throw error;
        return Array.isArray(data) ? (data as RigaAndamento[]) : [];
      } catch {
        return [];
      }
    },
  });

  // Dal più vecchio al più recente: il primo e l'ultimo prezzo dicono da sé come è andata.
  const andamentoCrescente = [...andamento].reverse();
  const primo = andamentoCrescente[0];
  const ultimo = andamentoCrescente[andamentoCrescente.length - 1];
  const variazione =
    andamentoCrescente.length > 1 && primo && ultimo && primo.prezzo_pagato > 0
      ? Math.round(((ultimo.prezzo_pagato - primo.prezzo_pagato) / primo.prezzo_pagato) * 1000) / 10
      : null;
  const rincari = andamento.filter((r) => r.e_rincaro).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Storico Movimenti: {item?.name}</DialogTitle>
          <DialogDescription>
            Tutti i movimenti di carico e scarico per questo articolo
          </DialogDescription>
        </DialogHeader>

        {andamento.length > 0 && (
          <section className="space-y-2 rounded-md border p-3" aria-label="Andamento del prezzo d'acquisto">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">Andamento del prezzo d&apos;acquisto</h3>
              <span className="text-sm tabular-nums text-muted-foreground">
                {andamento.length === 1
                  ? `Un solo acquisto, a ${formatCurrency(andamento[0].prezzo_pagato)}`
                  : `Dal primo (${formatCurrency(primo!.prezzo_pagato)}) all'ultimo (${formatCurrency(ultimo!.prezzo_pagato)})`}
                {variazione != null && variazione !== 0 && (
                  <span className={variazione > 0 ? "ml-1 font-medium text-amber-700 dark:text-amber-500" : "ml-1 font-medium text-emerald-700 dark:text-emerald-500"}>
                    {variazione > 0 ? "+" : "−"}{Math.abs(variazione).toFixed(1)}%
                  </span>
                )}
              </span>
            </div>
            {rincari > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-500">
                {rincari === 1
                  ? "Un acquisto è costato più del solito."
                  : `${rincari} acquisti sono costati più del solito.`}{" "}
                La soglia si cambia in Impostazioni → Approvazioni e avvisi.
              </p>
            )}
            <ul className="divide-y text-sm">
              {andamento.map((r) => (
                <li key={r.movement_id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
                  <span className="whitespace-nowrap text-muted-foreground">
                    {format(new Date(r.quando), "dd/MM/yyyy", { locale: it })}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{r.quantita} pz</span>
                  <span className="tabular-nums font-medium">{formatCurrency(r.prezzo_pagato)}</span>
                  {r.e_rincaro ? (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-amber-700 dark:text-amber-500">
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      +{Number(r.scostamento_perc ?? 0).toFixed(1)}% sul medio
                      {r.spesa_in_piu != null && ` · ${formatCurrency(r.spesa_in_piu)} in più`}
                    </span>
                  ) : r.medio_prima != null ? (
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      medio di allora {formatCurrency(r.medio_prima)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Caricamento...</div>
        ) : movements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nessun movimento registrato per questo articolo.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-center">Qtà</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Ordine</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(new Date(m.created_at), "dd/MM/yyyy HH:mm", { locale: it })}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={m.movement_type === "carico" ? "default" : "destructive"}
                      className={
                        m.movement_type === "carico"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                          : ""
                      }
                    >
                      {m.movement_type === "carico" ? "Carico" : "Scarico"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    {m.movement_type === "carico" ? "+" : "−"}{m.quantity}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {m.notes || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {m.orderCode || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
