import { formattaQuantitaMovimento } from "@/lib/magazzino/quantitaMovimento";
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
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { StockItemOverview } from "./StockItemOverview";
import type { InArrivoArticolo } from "@/hooks/useMagazzinoRiepilogo";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
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
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

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
  supplierName?: string;
  sectionName?: string;
  inArrivo?: InArrivoArticolo;
  arriviUnavailable?: boolean;
}

export function StockMovementHistoryDialog({
  open,
  onOpenChange,
  item,
  supplierName,
  sectionName,
  inArrivo,
  arriviUnavailable,
}: StockMovementHistoryDialogProps) {
  const t = useT();
  const permissions = usePermissions();
  const canViewCosts = !permissions.isLoading && permissions.canViewCosts;
  const { data: movements = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["stock-movements", item?.id],
    queryFn: async () => {
      if (!item) return [];
      const { data: raw, error } = await supabase
        .from("warehouse_movements")
        .select(`
          id, movement_type, quantity, notes, created_at, performed_by, rientro_commessa,
          order_item_id
        `)
        .eq("stock_item_id", item.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const data = (raw ?? []) as unknown as Array<{id:string;movement_type:string;quantity:number;notes:string|null;created_at:string;performed_by:string|null;order_item_id:string|null;rientro_commessa:boolean}>;
      // Fetch linked order info for movements with order_item_id
      const orderItemIds = data
        .filter((m) => m.order_item_id)
        .map((m) => m.order_item_id!);

      const orderMap: Record<string, string> = {};
      if (orderItemIds.length > 0) {
        const { data: orderItems, error: orderError } = await supabase
          .from("order_items")
          .select("id, order_id, order:orders(order_code)")
          .in("id", orderItemIds);

        if (orderError) throw orderError;
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
    enabled: !!item && open && canViewCosts,
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
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Dettaglio articolo · {name}", { name: String(item?.name ?? "") })}</DialogTitle>
          <DialogDescription>
            {t("Giacenze, impegni, ordini in arrivo e storico di carico e scarico.")}
          </DialogDescription>
        </DialogHeader>

        {item && <StockItemOverview item={item} supplierName={supplierName} sectionName={sectionName} inArrivo={inArrivo} arriviUnavailable={arriviUnavailable} canViewCosts={canViewCosts} />}

        {canViewCosts && andamento.length > 0 && (
          <section className="space-y-2 rounded-md border p-3" aria-label={t("Andamento del prezzo d'acquisto")}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">{t("Andamento del prezzo d'acquisto")}</h3>
              <span className="text-sm tabular-nums text-muted-foreground">
                {andamento.length === 1
                  ? t("Un solo acquisto, a {prezzo_pagato}", { prezzo_pagato: formatCurrency(andamento[0].prezzo_pagato) })
                  : t("Dal primo ({primo}) all'ultimo ({ultimo})", { primo: formatCurrency(primo!.prezzo_pagato), ultimo: formatCurrency(ultimo!.prezzo_pagato) })}
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
                  ? t("Un acquisto è costato più del solito.")
                  : t("{rincari} acquisti sono costati più del solito.", { rincari: String(rincari ?? "") })}{" "}
                {t("La soglia si cambia in Impostazioni → Approvazioni e avvisi.")}
              </p>
            )}
            <ul className="divide-y text-sm">
              {andamento.map((r) => (
                <li key={r.movement_id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
                  <span className="whitespace-nowrap text-muted-foreground">
                    {format(new Date(r.quando), "dd/MM/yyyy", { locale: dateFnsCampo() })}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{formattaQuantitaMovimento(Number(r.quantita))} {item?.unita_misura || t("unità")}</span>
                  <span className="tabular-nums font-medium">{formatCurrency(r.prezzo_pagato)}</span>
                  {r.e_rincaro ? (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-amber-700 dark:text-amber-500">
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("+{perc}% sul medio", { perc: Number(r.scostamento_perc ?? 0).toFixed(1) })}
                      {r.spesa_in_piu != null && " · " + t("{spesa_in_piu} in più", { spesa_in_piu: formatCurrency(r.spesa_in_piu) })}
                    </span>
                  ) : r.medio_prima != null ? (
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{t("medio di allora {medio_prima}", { medio_prima: formatCurrency(r.medio_prima) })}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{t("Caricamento...")}</div>
        ) : isError ? (
          <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm">{t("Impossibile caricare i movimenti.")} <Button variant="outline" size="sm" onClick={() => void refetch()}>{t("Riprova movimenti")}</Button></div>
        ) : movements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t("Nessun movimento registrato per questo articolo.")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Data")}</TableHead>
                <TableHead>{t("Tipo")}</TableHead>
                <TableHead className="text-center">{t("Qtà")}</TableHead>
                <TableHead>{t("Note")}</TableHead>
                <TableHead>{t("Ordine")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(new Date(m.created_at), "dd/MM/yyyy HH:mm", { locale: dateFnsCampo() })}
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
                      {m.rientro_commessa ? t("Reso da cantiere") : m.movement_type === "carico" ? t("Carico") : t("Scarico")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    {m.movement_type === "carico" ? "+" : "−"}{formattaQuantitaMovimento(Number(m.quantity))}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {m.rientro_commessa && /^Rientro dal cantiere · uscita [0-9a-f-]{36}$/.test(m.notes ?? "") ? t("Reso da cantiere collegato all’uscita originale") : m.notes || "—"}
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
