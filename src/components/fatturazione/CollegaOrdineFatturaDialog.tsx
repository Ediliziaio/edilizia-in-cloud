/**
 * Collega a mano una fattura ricevuta a uno o più ordini d'acquisto.
 *
 * L'aggancio automatico (trigger sul database) scatta solo quando i numeri
 * parlano chiaro: stesso fornitore, stesso importo, un solo candidato. Tutti
 * gli altri casi — acconti, ordini multipli, fatture cumulative — li decide
 * una persona da qui. I candidati che combaciano per P.IVA o importo salgono
 * in cima con un'etichetta, ma la scelta resta libera.
 *
 * Un ordine solo: tutta la fattura va su quello. Più ordini (il fornitore che
 * fattura a fine mese tutte le consegne): ognuno prende la sua quota
 * dell'imponibile, e quello che avanza resta un costo generale.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { ODA_STATUS_LABELS, ODA_STATI_EMESSI } from "@/lib/odaStatus";
import { leggiImporto, quotaProposta, verificaQuote, type QuotaOrdine } from "@/lib/fatturazione/quoteOrdini";

interface OdaCandidato {
  id: string;
  oda_number: string;
  status: string;
  issue_date: string | null;
  subtotal: number | null;
  total: number | null;
  supplier: { name: string; vat_number: string | null; fiscal_code: string | null } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  /** Dati della fattura da collegare, per evidenziare i candidati giusti. */
  fattura: {
    id: string;
    cedente_ragione_sociale: string;
    cedente_piva: string | null;
    cedente_cf: string | null;
    totale_documento: number | null;
    imponibile_totale: number | null;
  } | null;
  /** Chiamato con gli ordini scelti (e le quote, se più di uno): il chiamante scrive e invalida. */
  onScelto: (quote: QuotaOrdine[]) => void;
  saving?: boolean;
}

/** Stessa normalizzazione del trigger: solo cifre/lettere, via il prefisso IT. */
function normFiscale(v: string | null | undefined): string {
  return (v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^IT/, "");
}

export function CollegaOrdineFatturaDialog({
  open, onOpenChange, companyId, fattura, onScelto, saving,
}: Props) {
  const [ricerca, setRicerca] = useState("");
  /** odaId → quota scritta (testo, per lasciare scrivere «12,5»). */
  const [scelti, setScelti] = useState<Record<string, string>>({});

  const { data: ordini = [], isLoading } = useQuery({
    queryKey: ["oda-candidati-fattura", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("purchase_orders")
        .select("id, oda_number, status, issue_date, subtotal, total, supplier:suppliers(name, vat_number, fiscal_code)")
        .eq("company_id", companyId)
        .in("status", [...ODA_STATI_EMESSI])
        .order("issue_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as OdaCandidato[];
    },
    staleTime: 30_000,
  });

  // Gli ordini che hanno già una fattura (intera o una quota): collegarne
  // un'altra è possibile (acconto e saldo), ma va visto prima.
  const idOrdini = useMemo(() => ordini.map((o) => o.id), [ordini]);
  const { data: giaFatturati = new Set<string>() } = useQuery({
    queryKey: ["oda-gia-fatturati", companyId, idOrdini],
    enabled: open && !!companyId && idOrdini.length > 0,
    queryFn: async () => {
      const [intere, quote] = await Promise.all([
        (supabase as any).from("fatture_ricevute").select("id, purchase_order_id")
          .eq("company_id", companyId).in("purchase_order_id", idOrdini),
        (supabase as any).from("fattura_ricevuta_ordini").select("fattura_id, purchase_order_id")
          .eq("company_id", companyId).in("purchase_order_id", idOrdini),
      ]);
      if (intere.error) throw intere.error;
      if (quote.error) throw quote.error;
      const ids = new Set<string>();
      for (const r of (intere.data ?? []) as Array<{ id: string; purchase_order_id: string }>) {
        if (r.id !== fattura?.id) ids.add(r.purchase_order_id);
      }
      for (const r of (quote.data ?? []) as Array<{ fattura_id: string; purchase_order_id: string }>) {
        if (r.fattura_id !== fattura?.id) ids.add(r.purchase_order_id);
      }
      return ids;
    },
    staleTime: 30_000,
  });

  const lista = useMemo(() => {
    const piva = normFiscale(fattura?.cedente_piva);
    const cf = (fattura?.cedente_cf ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    const totale = fattura?.totale_documento;
    const imponibile = fattura?.imponibile_totale;

    const arricchiti = ordini.map((o) => {
      const stessoFornitore =
        (!!piva && normFiscale(o.supplier?.vat_number) === piva) ||
        (!!cf && (o.supplier?.fiscal_code ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "") === cf);
      const stessoImporto =
        (totale != null && o.total != null && Math.abs(Number(o.total) - totale) <= 0.01) ||
        (imponibile != null && o.subtotal != null && Math.abs(Number(o.subtotal) - imponibile) <= 0.01);
      return { ...o, stessoFornitore, stessoImporto, punteggio: (stessoFornitore ? 2 : 0) + (stessoImporto ? 1 : 0) };
    });

    const t = ricerca.trim().toLowerCase();
    const filtrati = t
      ? arricchiti.filter((o) =>
          scelti[o.id] !== undefined ||
          o.oda_number.toLowerCase().includes(t) ||
          (o.supplier?.name ?? "").toLowerCase().includes(t))
      : arricchiti;

    return filtrati.sort((a, b) => b.punteggio - a.punteggio || (b.issue_date ?? "").localeCompare(a.issue_date ?? ""));
  }, [ordini, fattura, ricerca, scelti]);

  const imponibile = fattura?.imponibile_totale ?? null;
  const quote: QuotaOrdine[] = Object.entries(scelti).map(([id, testo]) => ({
    purchase_order_id: id,
    importo: leggiImporto(testo),
  }));
  const esito = verificaQuote(imponibile, quote);
  const diviso = quote.length >= 2;

  const commuta = (o: OdaCandidato) => {
    setScelti((prev) => {
      if (prev[o.id] !== undefined) {
        const { [o.id]: _tolto, ...resto } = prev;
        return resto;
      }
      const gia = Object.values(prev).reduce((s, t) => s + (leggiImporto(t) || 0), 0);
      const proposta = quotaProposta(o.subtotal != null ? Number(o.subtotal) : null, imponibile, gia);
      return { ...prev, [o.id]: proposta.toFixed(2).replace(".", ",") };
    });
  };

  const chiudi = (o: boolean) => {
    if (!o) { setScelti({}); setRicerca(""); }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={chiudi}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-orange-500" />
            Collega la fattura agli ordini
          </DialogTitle>
          <DialogDescription>
            {fattura
              ? <>Fattura di <span className="font-medium">{fattura.cedente_ragione_sociale}</span>
                  {imponibile != null && <> · imponibile {formatCurrency(imponibile)}</>}.
                  {" "}Scegli l'ordine; se la fattura copre più ordini, scegline più d'uno e dai a ognuno la sua quota.</>
              : "Scegli l'ordine d'acquisto a cui appartiene questa fattura."}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per numero ordine o fornitore..."
            className="pl-9"
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
          />
        </div>

        <div className="max-h-[42vh] overflow-y-auto rounded-md border border-slate-200 divide-y">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : lista.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Nessun ordine emesso trovato. Gli ordini in bozza non compaiono:
              prima si inviano, poi si fatturano.
            </p>
          ) : (
            lista.map((o) => {
              const scelto = scelti[o.id] !== undefined;
              return (
                <div
                  key={o.id}
                  className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm transition-colors ${scelto ? "bg-orange-50/70" : "hover:bg-orange-50/40"}`}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <Checkbox checked={scelto} disabled={saving} onCheckedChange={() => commuta(o)} />
                    <span className="font-mono text-xs shrink-0">{o.oda_number}</span>
                    <span className="flex-1 truncate text-slate-600">
                      {o.supplier?.name ?? "—"}
                      {o.issue_date && <span className="text-xs text-slate-400"> · {formatDateShort(o.issue_date)}</span>}
                    </span>
                  </label>
                  {o.stessoFornitore && (
                    <Badge className="bg-emerald-100 text-emerald-700 text-[10px] shrink-0">stesso fornitore</Badge>
                  )}
                  {o.stessoImporto && (
                    <Badge className="bg-emerald-100 text-emerald-700 text-[10px] shrink-0">importo uguale</Badge>
                  )}
                  {giaFatturati.has(o.id) && (
                    <Badge
                      className="bg-amber-100 text-amber-800 text-[10px] shrink-0"
                      title="Questo ordine ha già una fattura: collegane un'altra solo se è un acconto, un saldo o una consegna in più"
                    >
                      già fatturato
                    </Badge>
                  )}
                  <span className="shrink-0 tabular-nums text-xs text-slate-500" title="Imponibile dell'ordine">
                    {o.subtotal != null ? formatCurrency(Number(o.subtotal)) : "—"}
                  </span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {ODA_STATUS_LABELS[o.status] ?? o.status}
                  </Badge>
                  {scelto && diviso && (
                    <div className="flex w-full items-center justify-end gap-2 pl-7">
                      <span className="text-xs text-slate-500">Quota di questa fattura</span>
                      <Input
                        inputMode="decimal"
                        aria-label={`Quota per ${o.oda_number}`}
                        className="h-8 w-32 text-right tabular-nums"
                        value={scelti[o.id]}
                        onChange={(e) => setScelti((prev) => ({ ...prev, [o.id]: e.target.value }))}
                      />
                      <span className="text-xs text-slate-500">€</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {quote.length > 0 && (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-0.5">
            {diviso ? (
              <>
                <p>
                  Assegnati <strong className="tabular-nums">{formatCurrency(esito.assegnato)}</strong>
                  {imponibile != null && <> su {formatCurrency(imponibile)}</>}
                  {esito.resto > 0.01 && !esito.errore && (
                    <> · <strong className="tabular-nums">{formatCurrency(esito.resto)}</strong> restano un costo generale, senza commessa</>
                  )}
                </p>
                <p className="text-slate-500">
                  Ogni commessa prende la quota del suo ordine. Si possono cambiare fino a quando la fattura non è contabilizzata.
                </p>
              </>
            ) : (
              <p>Tutta la fattura va su questo ordine.</p>
            )}
            {esito.errore && <p className="font-medium text-red-600">{esito.errore}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => chiudi(false)} disabled={saving}>Annulla</Button>
          <Button
            onClick={() => onScelto(quote.map((q) => ({ ...q, importo: Math.round(q.importo * 100) / 100 })))}
            disabled={saving || quote.length === 0 || !!esito.errore}
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {diviso ? `Dividi tra ${quote.length} ordini` : "Collega"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
