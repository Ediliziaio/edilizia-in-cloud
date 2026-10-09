import { useMemo } from "react";
import { formatCurrency } from "@/lib/formatters";
import { useQuery } from "@tanstack/react-query";
import { caricaRegistroVendite } from "@/lib/fatturazione/caricaRegistroVendite";
import { documentoNelRegistro, nomeIntestatario, chiaveClienteVendite, isNotaCredito } from "@/lib/fatturazione/registroVendite";
import { scaricaFileOriginale } from "@/lib/fatturazione/originaleEmessaImportata";
import { escapeCsvCell } from "@/lib/csvExport";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, parseISO, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

/**
 * Fetches ALL invoices for reporting by paginating through results.
 * Overcomes the 1000-row Supabase default limit.
 */
function useAllDocumentiForReport() {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["documenti-report-all", companyId, "native-e-importate"],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: () => caricaRegistroVendite(companyId!),
  });
}

export default function ReportFatturazione() {
  const { data: docs = [], isLoading, isError, refetch } = useAllDocumentiForReport();
  const registrate = useMemo(() => docs.filter(documentoNelRegistro), [docs]);
  const importate = registrate.filter(d => d.origine === "importata").length;

  // Monthly revenue last 12 months
  const monthlyData = useMemo(() => {
    const months: Record<string, { fatturato: number; incassato: number }> = {};
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, "yyyy-MM");
      months[key] = { fatturato: 0, incassato: 0 };
    }

    docs.forEach((doc) => {
      if (!documentoNelRegistro(doc)) return;
      const key = doc.data_emissione?.slice(0, 7);
      if (key && months[key] !== undefined) {
        months[key].fatturato += doc.imponibile_totale;
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
    const map = new Map<string, { name: string; value: number }>();
    docs.forEach((doc) => {
      if (!documentoNelRegistro(doc)) return;
      const key = chiaveClienteVendite(doc);
      const entry = map.get(key) ?? { name: nomeIntestatario(doc.cliente_snapshot), value: 0 };
      entry.value += doc.imponibile_totale;
      map.set(key, entry);
    });
    return [...map.values()]
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map(({ name, value }) => ({ name: name.length > 20 ? name.slice(0, 20) + "…" : name, fatturato: value }));
  }, [docs]);

  // IVA summary
  const ivaSummary = useMemo(() => {
    let debito = 0;
    let credito = 0;
    docs.forEach((doc) => {
      if (!documentoNelRegistro(doc)) return;
      if (isNotaCredito(doc.tipo)) credito += Math.abs(doc.iva_totale);
      else debito += doc.iva_totale;
    });
    return { debito, credito, saldo: debito - credito };
  }, [docs]);

  const handleExportCSV = () => {
    const header = "Numero;Data;Tipo;Cliente;P.IVA;CF;Imponibile;IVA;Totale;Origine\n";
    // Numero all'italiana: separatore di colonna ";" e virgola decimale, come
    // se lo aspetta Excel in italiano (col punto leggeva 1234.56 come 123456).
    const num = (v: number) => v.toFixed(2).replace(".", ",");
    const rows = docs
      // Le annullate restano fuori, come nel registro a schermo: prima finivano
      // nel file mandato al commercialista e gonfiavano l'IVA a debito.
      .filter(documentoNelRegistro)
      .map((d) => {
        // La nota di credito storna: va col segno meno, come nel registro.
        return [
          d.numero, d.data_emissione, d.tipo,
          nomeIntestatario(d.cliente_snapshot), d.cliente_snapshot?.partita_iva ?? "", d.cliente_snapshot?.codice_fiscale ?? "",
          num(d.imponibile_totale), num(d.iva_totale), num(d.totale_documento), d.origine,
        ].map((v) => escapeCsvCell(v as string | number, ";")).join(";");
      })
      .join("\n");
    scaricaFileOriginale(new Blob(["\uFEFF", header, rows], { type: "text/csv;charset=utf-8" }), "registro-iva.csv");
    toast.success("CSV esportato");
  };

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (isError) return <div role="alert" className="p-6">Non riesco a caricare il registro completo. Nessun totale parziale viene mostrato. <Button variant="outline" onClick={() => void refetch()}>Riprova</Button></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Report Fatturazione</h1>
          <p className="text-muted-foreground">{registrate.length} documenti emessi, di cui {importate} importati. Bozze escluse e note di credito sottratte.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-1" /> Registro IVA CSV
          </Button>
        </div>
      </div>
      <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">Fatturato al netto dell’IVA. Gli incassi registrati sono raggruppati per mese di emissione della fattura, non per data del pagamento.{importate > 0 && " L’XML non certifica gli incassi: lo storico dei pagamenti importati va verificato separatamente."}</p>

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
              <Area type="monotone" dataKey="fatturato" name="Fatturato (netto IVA)" fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary))" />
              <Area type="monotone" dataKey="incassato" name="Incassi registrati (IVA inclusa)" fill="hsl(142 76% 36% / 0.2)" stroke="hsl(142, 76%, 36%)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
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
          <CardHeader><CardTitle className="text-sm">Riepilogo IVA vendite · tutto lo storico</CardTitle></CardHeader>
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
