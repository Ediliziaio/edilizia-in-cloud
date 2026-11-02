/**
 * A quale commessa va una fattura. Il caso normale è un clic: si sceglie la commessa e si salva. L'importo compare solo
 * se la si divide, ed è sempre col totale della fattura, IVA compresa. Sul costo le quote si salvano sull'imponibile,
 * dove margine e pagamenti le leggono già.
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
import { problemaRipartizione, quoteDaVoci, quoteDelCosto, quoteLordeInNette, residuoDaAssegnare, vociFattura, type QuotaCommessa } from "@/lib/fatturazione/ripartizioneFattura";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface FatturaDaCollegare {
  id: string; numero: string | null; fornitore: string | null; imponibile: number | null; totale: number | null;
  companyCostId: string | null; purchaseOrderId?: string | null; suOrdini?: boolean;
}

type Riga = { chiave: number; order_id: string; importo: string };
const testoImporto = (n: number) => (Math.round(n * 100) / 100).toString().replace(".", ",");

export function CollegaFatturaCommesseDialog({ fattura, companyId, onChiudi, onScegliOrdine, commessaIniziale }: {
  fattura: FatturaDaCollegare; companyId: string; onChiudi: () => void; onScegliOrdine?: () => void; commessaIniziale?: string;
}) {
  const queryClient = useQueryClient();
  const totale = Math.abs(Number(fattura.totale ?? fattura.imponibile ?? 0));
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
  const salvate = useMemo(() => quoteDelCosto(data?.costo), [data?.costo]);
  const [perVoci, setPerVoci] = useState(false);
  const [righe, setRighe] = useState<Riga[]>([{ chiave: 0, order_id: commessaIniziale ?? "", importo: testoImporto(totale) }]);
  const [soloUnaParte, setSoloUnaParte] = useState(false);
  const [scelte, setScelte] = useState<Record<number, string | undefined>>({});
  const [salvataggio, setSalvataggio] = useState(false);
  const [letto, setLetto] = useState(false);

  // Si riparte da come è ora: cambiare una quota non deve voler dire riscriverle tutte.
  useEffect(() => {
    if (!data || letto) return;
    setLetto(true);
    if (salvate.length === 0) return;
    setRighe(salvate.map((q, i) => ({ chiave: i, order_id: q.order_id, importo: testoImporto((totale * q.pct) / 100) })));
    if (salvate.length === 1 && salvate[0].pct < 99.99) setSoloUnaParte(true);
    if (salvate.some((q) => q.righe?.length)) {
      setPerVoci(true);
      setScelte(Object.fromEntries(salvate.flatMap((q) => (q.righe ?? []).map((n) => [n, q.order_id]))));
    }
  }, [data, letto, salvate, totale]);

  const lorde: QuotaCommessa[] = righe.map((r) => ({ order_id: r.order_id, importo: leggiImporto(r.importo) }));
  const dasalvare = perVoci ? quoteDaVoci(voci, scelte) : quoteLordeInNette(lorde, totale, imponibile);
  const problema = perVoci ? problemaRipartizione(dasalvare, imponibile) : problemaRipartizione(lorde, totale);
  const residuo = perVoci
    ? residuoDaAssegnare(dasalvare, imponibile) * (imponibile ? totale / imponibile : 1)
    : residuoDaAssegnare(lorde, totale);
  const mostraImporti = righe.length > 1 || soloUnaParte;

  const cambiaImporto = (chiave: number, testo: string) => setRighe((prima) => {
    const dopo = prima.map((x) => (x.chiave === chiave ? { ...x, importo: testo } : x));
    // In due, l'altra prende il resto: non c'è da fare conti.
    if (dopo.length !== 2) return dopo;
    const resto = totale - leggiImporto(testo);
    return dopo.map((x) => (x.chiave === chiave || resto < 0 ? x : { ...x, importo: testoImporto(resto) }));
  });
  const aggiungi = () => setRighe((prima) => {
    const chiave = Math.max(...prima.map((x) => x.chiave)) + 1;
    if (prima.length === 1) {
      const meta = Math.round((totale / 2) * 100) / 100;
      return [{ ...prima[0], importo: testoImporto(meta) }, { chiave, order_id: "", importo: testoImporto(totale - meta) }];
    }
    return [...prima, { chiave, order_id: "", importo: residuo > 0 ? testoImporto(residuo) : "" }];
  });
  const togli = (chiave: number) => setRighe((prima) => {
    const dopo = prima.filter((x) => x.chiave !== chiave);
    return dopo.length === 1 ? [{ ...dopo[0], importo: testoImporto(totale) }] : dopo;
  });

  const salva = async (quote: QuotaCommessa[]) => {
    setSalvataggio(true);
    try {
      const { error } = await db.rpc("fattura_collega_commesse", { p_fattura_id: fattura.id, p_quote: quote });
      if (error) throw error;
      toast.success(quote.length === 0 ? "Fattura scollegata dalle commesse" : quote.length === 1 ? "Fattura collegata alla commessa" : `Fattura divisa su ${quote.length} commesse`);
      refreshFinancialQueries(queryClient);
      for (const k of ["fatture-ricevute", "fatture-costi-commesse", "fattura-ricevuta-riepilogo", "margin"]) void queryClient.invalidateQueries({ queryKey: [k] });
      onChiudi();
    } catch (e) {
      toast.error("Collegamento non salvato", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvataggio(false);
    }
  };

  const linkDiscreto = "text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50";
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onChiudi(); }}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>A quale commessa va?</DialogTitle>
          <DialogDescription>{fattura.fornitore ?? "Fornitore"} · n. {fattura.numero ?? "—"} · <span className="font-medium text-foreground">{formatCurrency(totale)}</span> IVA inclusa</DialogDescription>
        </DialogHeader>
        {suOrdine ? (
          <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            È su un ordine d’acquisto: la commessa viene da lì. Per sceglierla qui, scollegala prima dall’ordine.
          </p>
        ) : isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">Caricamento…</p>
        ) : perVoci ? (
          <div className="space-y-2">
            <ul className="divide-y rounded-md border" aria-label="Voci della fattura">
              {voci.map((v) => (
                <li key={v.numero} className="space-y-1.5 p-2 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0">{v.descrizione}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatCurrency(v.imponibile * (imponibile ? totale / imponibile : 1))}</span>
                  </div>
                  <OrderSelectCombobox filtroIniziale="all" companyId={companyId} value={scelte[v.numero]} placeholder="Commessa…" onChange={(id: string) => setScelte({ ...scelte, [v.numero]: id })} />
                </li>
              ))}
            </ul>
            <button type="button" className={linkDiscreto} onClick={() => setPerVoci(false)}>Torna a dividere per importi</button>
          </div>
        ) : (
          <div className="space-y-2">
            {righe.map((r, i) => (
              <div key={r.chiave} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <OrderSelectCombobox filtroIniziale="all" companyId={companyId} value={r.order_id || undefined} placeholder="Cerca la commessa…"
                    esclusi={righe.filter((x) => x.chiave !== r.chiave).map((x) => x.order_id).filter(Boolean)}
                    onChange={(id: string) => setRighe(righe.map((x) => (x.chiave === r.chiave ? { ...x, order_id: id } : x)))} />
                </div>
                {mostraImporti && (
                  <div className="relative w-28 shrink-0">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                    <Input aria-label={`Importo della commessa ${i + 1}`} inputMode="decimal" className="pl-6 text-right" value={r.importo} onChange={(e) => cambiaImporto(r.chiave, e.target.value)} />
                  </div>
                )}
                {righe.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`Togli la commessa ${i + 1}`} onClick={() => togli(r.chiave)}><X className="h-4 w-4" /></Button>
                )}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
              <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" onClick={aggiungi}>
                <Plus className="h-4 w-4" />Dividi su un’altra commessa
              </button>
              {voci.length > 1 && <button type="button" className={linkDiscreto} onClick={() => setPerVoci(true)}>Voce per voce</button>}
              {righe.length === 1 && !soloUnaParte && <button type="button" className={linkDiscreto} onClick={() => setSoloUnaParte(true)}>Solo una parte</button>}
            </div>
          </div>
        )}
        {!suOrdine && !isLoading && Math.abs(residuo) > 0.009 && (perVoci || mostraImporti) && (
          <p className={residuo < 0 ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {residuo > 0 ? `Restano ${formatCurrency(residuo)} fuori dalle commesse.` : `Hai assegnato ${formatCurrency(-residuo)} di troppo.`}
          </p>
        )}
        {/* Una riga ancora vuota non è un errore: basta che «Salva» aspetti. */}
        {problema && dasalvare.every((q) => q.order_id) && <p role="alert" className="text-sm text-destructive">{problema}</p>}
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {onScegliOrdine && <button type="button" className={linkDiscreto} onClick={onScegliOrdine}>{suOrdine ? "Cambia ordine d’acquisto" : "Va su un ordine d’acquisto"}</button>}
            {!suOrdine && salvate.length > 0 && <button type="button" className={linkDiscreto} disabled={salvataggio} onClick={() => void salva([])}>Scollega</button>}
          </div>
          {!suOrdine && (
            <Button type="button" disabled={salvataggio || isLoading || !!problema || dasalvare.length === 0} onClick={() => void salva(dasalvare)}>
              {salvataggio && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Salva
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
