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
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
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

/** Stati delle matricole (stock_units.status) come li legge chi lavora in magazzino. */
const ETICHETTE_MATRICOLA: Record<string, string> = {
  in_stock: "In magazzino", available: "Disponibile", reserved: "Impegnato", delivered: "Consegnato",
  installed: "Installato", returned: "Reso", defective: "Difettoso", scrapped: "Scartato",
};

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
  warehouseName?: string;
  inArrivo?: InArrivoArticolo;
  arriviUnavailable?: boolean;
  /** Comandi sull'articolo (carica, preleva, prenota, modifica) sotto il titolo. */
  azioni?: ReactNode;
}

/** Una lettura in più della finestra: se manca la tabella o il permesso, la sezione non compare. */
async function leggiSenzaErrori<T>(lettura: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await lettura();
    if (error) return [];
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

export function StockMovementHistoryDialog({
  open,
  onOpenChange,
  item,
  supplierName,
  sectionName,
  warehouseName,
  inArrivo,
  arriviUnavailable,
  azioni,
}: StockMovementHistoryDialogProps) {
  const t = useT();
  const permissions = usePermissions();
  const canViewCosts = !permissions.isLoading && permissions.canViewCosts;
  const { data: movements = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["stock-movements", item?.id, canViewCosts],
    queryFn: async () => {
      if (!item) return [];
      const { data: raw, error } = await supabase
        .from("warehouse_movements")
        .select(`
          id, movement_type, quantity, notes, created_at, performed_by, rientro_commessa,
          order_item_id, order_id, lot_number${canViewCosts ? ", unit_cost" : ""}
        `)
        .eq("stock_item_id", item.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const data = (raw ?? []) as unknown as Array<{id:string;movement_type:string;quantity:number;notes:string|null;created_at:string;performed_by:string|null;order_item_id:string|null;order_id?:string|null;lot_number?:string|null;unit_cost?:number|null;rientro_commessa:boolean}>;
      // Fetch linked order info for movements with order_item_id
      const orderItemIds = data
        .filter((m) => m.order_item_id)
        .map((m) => m.order_item_id!);

      const orderMap: Record<string, string> = {};
      const commessaDaRiga: Record<string, string> = {};
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
            commessaDaRiga[oi.id] = oi.order_id;
          }
        }
      }
      // Commesse dei movimenti che la portano direttamente (uscite, resi) e non dalla riga.
      const senzaCodice = [...new Set(data.filter((m) => m.order_id && !m.order_item_id).map((m) => m.order_id!))];
      const codici: Record<string, string> = {};
      if (senzaCodice.length > 0) {
        const ordini = await leggiSenzaErrori<{ id: string; order_code: string | null }>(() => supabase.from("orders").select("id, order_code").in("id", senzaCodice));
        for (const o of ordini) codici[o.id] = o.order_code || o.id.slice(0, 8);
      }

      return data.map((m) => ({
        ...m,
        orderId: m.order_item_id ? commessaDaRiga[m.order_item_id] ?? m.order_id ?? null : m.order_id ?? null,
        orderCode: m.order_item_id ? orderMap[m.order_item_id] || "—" : m.order_id ? codici[m.order_id] || "—" : null,
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

  // 26/11/2026: per quali commesse è impegnato, i lotti e le matricole. Ogni lettura che fallisce
  // nasconde solo la sua sezione.
  const { data: impegni = [] } = useQuery({
    queryKey: ["stock-impegni-commesse", item?.id],
    enabled: !!item && open,
    queryFn: async () => {
      if (!item) return [];
      const righe = await leggiSenzaErrori<{ id: string; order_id: string; name: string | null; quantity: number | null; quantity_reserved: number | null }>(() =>
        supabase.from("order_items_senza_prezzi" as "order_items").select("id, order_id, name, quantity, quantity_reserved").eq("stock_item_id", item.id));
      const conImpegno = righe.filter((r) => Number(r.quantity_reserved ?? 0) > 0);
      if (conImpegno.length === 0) return [];
      const ordini = await leggiSenzaErrori<{ id: string; order_code: string | null; client_name: string | null }>(() =>
        supabase.from("orders").select("id, order_code, client_name").in("id", [...new Set(conImpegno.map((r) => r.order_id))]));
      const perId = new Map(ordini.map((o) => [o.id, o]));
      return conImpegno.map((r) => ({ ...r, ordine: perId.get(r.order_id) }));
    },
  });
  const { data: lotti = [] } = useQuery({
    queryKey: ["stock-lotti-articolo", item?.id],
    enabled: !!item && open,
    queryFn: () => item ? leggiSenzaErrori<{ id: string; codice_lotto: string; quantita: number | null; data_scadenza: string | null; posizione: string | null }>(() =>
      supabase.from("stock_lotti").select("id, codice_lotto, quantita, data_scadenza, posizione").eq("stock_item_id", item.id)) : Promise.resolve([]),
  });
  const { data: matricole = [] } = useQuery({
    queryKey: ["stock-matricole-articolo", item?.id],
    enabled: !!item && open && item.tracking_mode === "serialized",
    queryFn: () => item ? leggiSenzaErrori<{ status: string | null }>(() =>
      supabase.from("stock_units").select("status").eq("stock_item_id", item.id)) : Promise.resolve([]),
  });
  const matricolePerStato = matricole.reduce<Record<string, number>>((acc, m) => { const k = m.status || "—"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});

  // Riepilogo dei movimenti: l'ultimo carico, l'ultimo prelievo e quanto è uscito negli ultimi 90 giorni.
  const ultimoCarico = movements.find((m) => m.movement_type === "carico" && !m.rientro_commessa);
  const ultimoScarico = movements.find((m) => m.movement_type !== "carico");
  // L'istante si fissa all'apertura: Date.now() durante il disegno cambierebbe a ogni render.
  const [adesso] = useState(() => Date.now());
  const da90 = adesso - 90 * 86400000;
  const uscito90 = movements.filter((m) => m.movement_type !== "carico" && new Date(m.created_at).getTime() >= da90).reduce((t, m) => t + Number(m.quantity), 0);
  const entrato90 = movements.filter((m) => m.movement_type === "carico" && new Date(m.created_at).getTime() >= da90).reduce((t, m) => t + Number(m.quantity), 0);
  const um = item?.unita_misura || "";
  const giorno = (iso: string) => format(new Date(iso), "dd/MM/yyyy", { locale: dateFnsCampo() });

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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Dettaglio articolo · {name}", { name: String(item?.name ?? "") })}</DialogTitle>
          <DialogDescription>
            {t("Giacenze, impegni, ordini in arrivo e storico di carico e scarico.")}
          </DialogDescription>
          {azioni && <div className="flex flex-wrap gap-1.5 pt-1">{azioni}</div>}
        </DialogHeader>

        {item && <StockItemOverview item={item} supplierName={supplierName} sectionName={sectionName} warehouseName={warehouseName} inArrivo={inArrivo} arriviUnavailable={arriviUnavailable} canViewCosts={canViewCosts} />}

        {item && (
        <div className="grid gap-3 md:grid-cols-2">
          <section className="space-y-1.5 rounded-md border p-3" aria-label={t("Riepilogo movimenti")}>
            <h3 className="text-sm font-medium">{t("Riepilogo movimenti")}</h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <div><dt className="text-xs text-muted-foreground">{t("Ultimo carico")}</dt><dd className="tabular-nums">{ultimoCarico ? `${giorno(ultimoCarico.created_at)} · +${formattaQuantitaMovimento(Number(ultimoCarico.quantity))} ${um}` : "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{t("Ultimo prelievo")}</dt><dd className="tabular-nums">{ultimoScarico ? `${giorno(ultimoScarico.created_at)} · −${formattaQuantitaMovimento(Number(ultimoScarico.quantity))} ${um}` : "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{t("Entrato negli ultimi 90 giorni")}</dt><dd className="tabular-nums">{formattaQuantitaMovimento(entrato90)} {um}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{t("Uscito negli ultimi 90 giorni")}</dt><dd className="tabular-nums">{formattaQuantitaMovimento(uscito90)} {um}</dd></div>
            </dl>
          </section>
          <section className="space-y-1.5 rounded-md border p-3" aria-label={t("Impegnato per commessa")}>
            <h3 className="text-sm font-medium">{t("Impegnato per commessa")}</h3>
            {impegni.length === 0 ? <p className="text-sm text-muted-foreground">{t("Nessuna commessa ha impegnato questo articolo.")}</p> : (
              <ul className="divide-y text-sm">
                {impegni.map((r) => <li key={r.id} className="flex items-baseline justify-between gap-3 py-1">
                  <Link to={`/azienda/ordini/${r.order_id}`} className="min-w-0 truncate text-primary hover:underline">{r.ordine?.order_code || t("Commessa")}{r.ordine?.client_name ? ` · ${r.ordine.client_name}` : ""}</Link>
                  <span className="shrink-0 tabular-nums">{formattaQuantitaMovimento(Number(r.quantity_reserved))} {um}</span>
                </li>)}
              </ul>
            )}
          </section>
          {lotti.length > 0 && <section className="space-y-1.5 rounded-md border p-3" aria-label={t("Lotti")}>
            <h3 className="text-sm font-medium">{t("Lotti")} <span className="text-muted-foreground">· {lotti.length}</span></h3>
            <ul className="divide-y text-sm">
              {lotti.map((l) => <li key={l.id} className="flex items-baseline justify-between gap-3 py-1">
                <span className="min-w-0 truncate font-mono text-xs">{l.codice_lotto}{l.posizione ? <span className="font-sans text-muted-foreground"> · {l.posizione}</span> : null}</span>
                <span className="shrink-0 tabular-nums">{formattaQuantitaMovimento(Number(l.quantita ?? 0))} {um}{l.data_scadenza ? <span className="ml-2 text-xs text-muted-foreground">{t("scade il {data}", { data: giorno(l.data_scadenza) })}</span> : null}</span>
              </li>)}
            </ul>
          </section>}
          {matricole.length > 0 && <section className="space-y-1.5 rounded-md border p-3" aria-label={t("Matricole")}>
            <h3 className="text-sm font-medium">{t("Matricole")} <span className="text-muted-foreground">· {matricole.length}</span></h3>
            <ul className="flex flex-wrap gap-2 text-sm">
              {Object.entries(matricolePerStato).map(([stato, n]) => <li key={stato} className="rounded-md border bg-slate-50 px-2 py-0.5"><span className="text-muted-foreground">{t(ETICHETTE_MATRICOLA[stato] ?? stato)}</span> <b className="tabular-nums">{n}</b></li>)}
            </ul>
          </section>}
        </div>
        )}

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
                <TableHead className="text-right">{t("Qtà")}</TableHead>
                <TableHead>{t("Lotto")}</TableHead>
                {canViewCosts && <TableHead className="text-right">{t("Costo unitario")}</TableHead>}
                <TableHead>{t("Commessa")}</TableHead>
                <TableHead>{t("Note")}</TableHead>
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
                  <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                    {m.movement_type === "carico" ? "+" : "−"}{formattaQuantitaMovimento(Number(m.quantity))}{um ? <span className="ml-1 text-xs font-normal text-muted-foreground">{um}</span> : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{m.lot_number || "—"}</TableCell>
                  {canViewCosts && <TableCell className="text-right text-sm tabular-nums">{m.unit_cost != null ? formatCurrency(Number(m.unit_cost)) : "—"}</TableCell>}
                  <TableCell className="whitespace-nowrap text-sm">
                    {m.orderId && m.orderCode ? <Link to={`/azienda/ordini/${m.orderId}`} className="text-primary hover:underline">{m.orderCode}</Link> : m.orderCode || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[240px] truncate">
                    {m.rientro_commessa && /^Rientro dal cantiere · uscita [0-9a-f-]{36}$/.test(m.notes ?? "") ? t("Reso da cantiere collegato all’uscita originale") : m.notes || "—"}
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
