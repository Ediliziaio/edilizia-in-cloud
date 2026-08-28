import { useMemo } from "react";
import { formatCurrency } from "@/lib/formatters";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { escapeCsvCell } from "@/lib/csvExport";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, parseISO, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import type { DocumentoFiscale } from "@/types/fatturazione";

/**
 * Fetches ALL invoices for reporting by paginating through results.
 * Overcomes the 1000-row Supabase default limit.
 */
function useAllDocumentiForReport() {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["documenti-report-all", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let allDocs: Record<string, unknown>[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase
          .from("documenti_fiscali" as never)
          .select("numero, data_emissione, tipo, stato, cliente_snapshot, imponibile_totale, iva_totale, totale_documento, importo_pagato")
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .order("data_emissione", { ascending: false })
          .range(from, to);

        if (error) throw error;

        const rows = (data as unknown as Record<string, unknown>[]) ?? [];
        allDocs = allDocs.concat(rows);
        hasMore = rows.length === PAGE_SIZE;
        page++;
      }

      return allDocs as unknown as Pick<DocumentoFiscale, "numero" | "data_emissione" | "tipo" | "stato" | "cliente_snapshot" | "imponibile_totale" | "iva_totale" | "totale_documento" | "importo_pagato">[];
    },
  });
}

export default function ReportFatturazione() {
  const { data: docs = [], isLoading } = useAllDocumentiForReport();

  // Monthly revenue last 12 months
  const monthlyData = useMemo(() => {
    const months: Record<string, { fatturato: number; incassato: number }> = {};
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, "yyyy-MM");
      months[key] = { fatturato: 0, incassato: 0 };
    }

    docs.forEach((doc) => {
      if (!["fattura", "fattura_pa", "parcella", "fattura_accompagnatoria"].includes(doc.tipo)) return;
      if (["bozza", "annullata"].includes(doc.stato)) return;
      const key = doc.data_emissione?.slice(0, 7);
      if (key && months[key] !== undefined) {
        months[key].fatturato += doc.totale_documento;
        months[key].incassato += doc.importo_pagato;
      }
    });

    return Object.entries(months).map(([key, val]) => ({
      mese: format(parseISO(`${key}-01`), "MMM yy", { locale: it }),
      ...val,
    }));
  }, [docs]);

  // Top 10 clients
  const topClients = useMemo(() => {
    const map: Record<string, number> = {};
    docs.forEach((doc) => {
      if (!["fattura", "fattura_pa", "parcella", "fattura_accompagnatoria"].includes(doc.tipo)) return;
      if (["bozza", "annullata"].includes(doc.stato)) return;
      const name = doc.cliente_snapshot?.ragione_sociale || "Sconosciuto";
      map[name] = (map[name] ?? 0) + doc.totale_documento;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, value]) => ({ name: name.length > 20 ? name.slice(0, 20) + "…" : name, fatturato: value }));
  }, [docs]);

  // IVA summary
  const ivaSummary = useMemo(() => {
    let debito = 0;
    let credito = 0;
    docs.forEach((doc) => {
      if (["bozza", "annullata"].includes(doc.stato)) return;
      if (["fattura", "fattura_pa", "parcella", "fattura_accompagnatoria"].includes(doc.tipo)) debito += doc.iva_totale;
      if (doc.tipo === "nota_credito") credito += Math.abs(doc.iva_totale);
    });
    return { debito, credito, saldo: debito - credito };
  }, [docs]);

  const handleExportCSV = () => {
    const header = "Numero;Data;Tipo;Cliente;P.IVA;Imponibile;IVA;Totale\n";
    const rows = docs
      .filter((d) => ["fattura", "fattura_pa", "parcella", "fattura_accompagnatoria", "nota_credito"].includes(d.tipo) && d.stato !== "bozza")
      .map((d) => [
        d.numero, d.data_emissione, d.tipo,
        d.cliente_snapshot?.ragione_sociale ?? "", d.cliente_snapshot?.partita_iva ?? "",
        d.imponibile_totale.toFixed(2), d.iva_totale.toFixed(2), d.totale_documento.toFixed(2),
      ].map((v) => escapeCsvCell(v as string | number, ";")).join(";"))
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "registro-iva.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV esportato");
  };

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Report Fatturazione</h1>
          <p className="text-muted-foreground">Analisi finanziaria e export dati ({docs.length} documenti).</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-1" /> Registro IVA CSV
          </Button>
        </div>
      </div>

      {/* Fatturato mensile */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Fatturato mensile (ultimi 12 mesi)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="mese" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend />
              <Area type="monotone" dataKey="fatturato" name="Fatturato" fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary))" />
              <Area type="monotone" dataKey="incassato" name="Incassato" fill="hsl(142 76% 36% / 0.2)" stroke="hsl(142, 76%, 36%)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        {/* Top clients */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Top 10 Clienti per Fatturato</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topClients} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" className="text-xs" />
                <YAxis dataKey="name" type="category" width={120} className="text-xs" />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="fatturato" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* IVA summary */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Liquidazione IVA</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">IVA a debito (vendite)</span>
                <span className="font-mono font-semibold">{formatCurrency(ivaSummary.debito)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">IVA a credito (NC)</span>
                <span className="font-mono font-semibold">{formatCurrency(ivaSummary.credito)}</span>
              </div>
              <hr />
              <div className="flex justify-between text-sm">
                <span className="font-medium">Saldo IVA</span>
                <span className={`font-mono font-bold ${ivaSummary.saldo > 0 ? "text-destructive" : "text-emerald-600"}`}>
                  {formatCurrency(ivaSummary.saldo)}
                </span>
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              ⚠️ Per la liquidazione definitiva consultare il proprio commercialista. I dati sono indicativi.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
