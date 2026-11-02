/**
 * Dove va una fattura: su una commessa, su più commesse (a importi o voce per voce), oppure su un ordine d'acquisto.
 * Le quote finiscono sul costo della fattura, dove margine e pagamenti le leggono già.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { leggiImporto } from "@/lib/fatturazione/quoteOrdini";
import { problemaRipartizione, quoteDaVoci, quoteDelCosto, residuoDaAssegnare, vociFattura, type QuotaCommessa } from "@/lib/fatturazione/ripartizioneFattura";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface FatturaDaCollegare {
  id: string; numero: string | null; fornitore: string | null; imponibile: number | null; totale: number | null;
  companyCostId: string | null; purchaseOrderId?: string | null; suOrdini?: boolean;
}

type Riga = { chiave: number; order_id: string; importo: string };

export function CollegaFatturaCommesseDialog({ fattura, companyId, onChiudi, onScegliOrdine, commessaIniziale }: {
  fattura: FatturaDaCollegare; companyId: string; onChiudi: () => void; onScegliOrdine?: () => void; commessaIniziale?: string;
}) {
  const queryClient = useQueryClient();
  const imponibile = Math.abs(Number(fattura.imponibile ?? fattura.totale ?? 0));
  const suOrdine = !!fattura.purchaseOrderId || !!fattura.suOrdini;
  const { data, isLoading } = useQuery({
    queryKey: ["fattura-collega-commesse", fattura.id],
    staleTime: 0,
    queryFn: async () => {
      const [{ data: f, error: e1 }, costo] = await Promise.all([
        db.from("fatture_ricevute").select("righe").eq("id", fattura.id).eq("company_id", companyId).maybeSingle(),
        fattura.companyCostId
          ? db.from("company_costs").select("order_id, allocations").eq("id", fattura.companyCostId).eq("company_id", companyId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (e1) throw e1;
      if (costo.error) throw costo.error;
      return { righe: f?.righe ?? null, costo: costo.data };
    },
  });
  const voci = useMemo(() => vociFattura(data?.righe), [data?.righe]);
  const [modo, setModo] = useState<"importi" | "voci">("importi");
  const [righe, setRighe] = useState<Riga[]>([{ chiave: 0, order_id: commessaIniziale ?? "", importo: String(imponibile).replace(".", ",") }]);
  const [scelte, setScelte] = useState<Record<number, string | undefined>>({});
  const [salvataggio, setSalvataggio] = useState(false);
  const [letto, setLetto] = useState(false);

  // Si riparte da come è ora, non da zero: cambiare una quota non deve voler dire riscriverle tutte.
  useEffect(() => {
    if (!data || letto) return;
    setLetto(true);
    const salvate = quoteDelCosto(data.costo);
    if (salvate.length === 0) return;
    setRighe(salvate.map((q, i) => ({ chiave: i, order_id: q.order_id, importo: String(q.importo ?? Math.round(imponibile * q.pct) / 100).replace(".", ",") })));
    if (salvate.some((q) => q.righe?.length)) {
      setModo("voci");
      setScelte(Object.fromEntries(salvate.flatMap((q) => (q.righe ?? []).map((n) => [n, q.order_id]))));
    }
  }, [data, letto, imponibile]);

  const quote: QuotaCommessa[] = modo === "voci"
    ? quoteDaVoci(voci, scelte)
    : righe.map((r) => ({ order_id: r.order_id, importo: leggiImporto(r.importo) }));
  const problema = problemaRipartizione(quote, imponibile);
  const residuo = residuoDaAssegnare(quote, imponibile);

  const salva = async (daSalvare: QuotaCommessa[]) => {
    setSalvataggio(true);
    try {
      const { error } = await db.rpc("fattura_collega_commesse", { p_fattura_id: fattura.id, p_quote: daSalvare });
      if (error) throw error;
      toast.success(daSalvare.length === 0 ? "Fattura scollegata dalle commesse" : daSalvare.length === 1 ? "Fattura collegata alla commessa" : `Fattura ripartita su ${daSalvare.length} commesse`);
      refreshFinancialQueries(queryClient);
      for (const k of ["fatture-ricevute", "fatture-costi-commesse", "fattura-ricevuta-riepilogo", "margin"]) void queryClient.invalidateQueries({ queryKey: [k] });
      onChiudi();
    } catch (e) {
      toast.error("Collegamento non salvato", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvataggio(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onChiudi(); }}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Collega la fattura {fattura.numero ?? ""}</DialogTitle>
          <DialogDescription>{fattura.fornitore ?? "Fornitore"} · imponibile {formatCurrency(imponibile)}. Sulla commessa entra la sua quota, nel margine e nei pagamenti.</DialogDescription>
        </DialogHeader>
        {suOrdine ? (
          <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            È collegata a un ordine d’acquisto: la commessa viene da lì. Per metterla direttamente su una commessa, scollegala prima dall’ordine.
          </p>
        ) : isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">Caricamento…</p>
        ) : (
          <div className="space-y-3">
            {voci.length > 1 && (
              <div role="group" aria-label="Come dividerla" className="inline-flex rounded-md border p-0.5 text-sm">
                {([["importi", "A importi"], ["voci", "Voce per voce"]] as const).map(([v, t]) => (
                  <button key={v} type="button" aria-pressed={modo === v} onClick={() => setModo(v)} className={cn("rounded px-3 py-1", modo === v && "bg-primary/10 font-medium text-primary")}>{t}</button>
                ))}
              </div>
            )}
            {modo === "importi" ? (
              <div className="space-y-2">
                {righe.map((r, i) => (
                  <div key={r.chiave} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <OrderSelectCombobox companyId={companyId} value={r.order_id || undefined} placeholder="Cerca la commessa…"
                        onChange={(id) => setRighe(righe.map((x) => (x.chiave === r.chiave ? { ...x, order_id: id } : x)))} />
                    </div>
                    <Input aria-label={`Importo della commessa ${i + 1}`} inputMode="decimal" className="w-28 text-right" value={r.importo}
                      onChange={(e) => setRighe(righe.map((x) => (x.chiave === r.chiave ? { ...x, importo: e.target.value } : x)))} />
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`Togli la commessa ${i + 1}`} disabled={righe.length === 1}
                      onClick={() => setRighe(righe.filter((x) => x.chiave !== r.chiave))}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setRighe([...righe, { chiave: Math.max(...righe.map((x) => x.chiave)) + 1, order_id: "", importo: residuo > 0 ? String(residuo).replace(".", ",") : "" }])}>
                  <Plus className="mr-1.5 h-4 w-4" />Aggiungi una commessa
                </Button>
              </div>
            ) : (
              <ul className="divide-y rounded-md border" aria-label="Voci della fattura">
                {voci.map((v) => (
                  <li key={v.numero} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm">
                    <span className="min-w-0 flex-1 basis-48">{v.descrizione}<span className="ml-2 tabular-nums text-muted-foreground">{formatCurrency(v.imponibile)}</span></span>
                    <div className="w-full sm:w-64">
                      <OrderSelectCombobox companyId={companyId} value={scelte[v.numero]} placeholder="Commessa…" onChange={(id) => setScelte({ ...scelte, [v.numero]: id })} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className={cn("text-sm", residuo < 0 ? "text-destructive" : "text-muted-foreground")}>
              {residuo > 0.009 ? `Restano ${formatCurrency(residuo)} non assegnati: non entrano in nessuna commessa.` : residuo < -0.009 ? `Hai assegnato ${formatCurrency(-residuo)} di troppo.` : "Tutto l’imponibile è assegnato."}
            </p>
            {problema && quote.some((q) => q.order_id) && <p role="alert" className="text-sm text-destructive">{problema}</p>}
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {onScegliOrdine && <Button type="button" variant="outline" onClick={onScegliOrdine}>{suOrdine ? "Cambia ordine d’acquisto" : "Collega a un ordine d’acquisto"}</Button>}
            {!suOrdine && quoteDelCosto(data?.costo).length > 0 && <Button type="button" variant="ghost" disabled={salvataggio} onClick={() => void salva([])}>Scollega</Button>}
          </div>
          {!suOrdine && (
            <Button type="button" disabled={salvataggio || isLoading || !!problema || quote.length === 0} onClick={() => void salva(quote)}>
              {salvataggio && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Salva
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
