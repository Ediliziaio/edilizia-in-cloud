/**
 * Collega a mano una fattura ricevuta a un ordine d'acquisto.
 *
 * L'aggancio automatico (trigger sul database) scatta solo quando i numeri
 * parlano chiaro: stesso fornitore, stesso importo, un solo candidato. Tutti
 * gli altri casi — acconti, ordini multipli, fatture cumulative — li decide
 * una persona da qui. I candidati che combaciano per P.IVA o importo salgono
 * in cima con un'etichetta, ma la scelta resta libera.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { ODA_STATUS_LABELS, ODA_STATI_EMESSI } from "@/lib/odaStatus";

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
  /** Chiamato con l'ordine scelto: il chiamante scrive e invalida. */
  onScelto: (odaId: string) => void;
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
          o.oda_number.toLowerCase().includes(t) ||
          (o.supplier?.name ?? "").toLowerCase().includes(t))
      : arricchiti;

    return filtrati.sort((a, b) => b.punteggio - a.punteggio || (b.issue_date ?? "").localeCompare(a.issue_date ?? ""));
  }, [ordini, fattura, ricerca]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-orange-500" />
            Collega la fattura a un ordine
          </DialogTitle>
          <DialogDescription>
            {fattura
              ? <>Fattura di <span className="font-medium">{fattura.cedente_ragione_sociale}</span>
                  {fattura.totale_documento != null && <> da {formatCurrency(fattura.totale_documento)}</>}:
                  scegli l'ordine d'acquisto a cui appartiene.</>
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

        <div className="max-h-[45vh] overflow-y-auto rounded-md border border-slate-200 divide-y">
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
            lista.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={saving}
                onClick={() => onScelto(o.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-orange-50/60 disabled:opacity-50 transition-colors"
              >
                <span className="font-mono text-xs shrink-0">{o.oda_number}</span>
                <span className="flex-1 truncate text-slate-600">
                  {o.supplier?.name ?? "—"}
                  {o.issue_date && <span className="text-xs text-slate-400"> · {formatDateShort(o.issue_date)}</span>}
                </span>
                {o.stessoFornitore && (
                  <Badge className="bg-emerald-100 text-emerald-700 text-[10px] shrink-0">stesso fornitore</Badge>
                )}
                {o.stessoImporto && (
                  <Badge className="bg-emerald-100 text-emerald-700 text-[10px] shrink-0">importo uguale</Badge>
                )}
                <span className="shrink-0 tabular-nums font-medium">
                  {o.total != null ? formatCurrency(Number(o.total)) : "—"}
                </span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {ODA_STATUS_LABELS[o.status] ?? o.status}
                </Badge>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
