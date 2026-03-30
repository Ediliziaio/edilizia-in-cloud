// src/pages/azienda/fatturazione/RegistroIVA.tsx
// GAP-05: Registro IVA acquisti e vendite con liquidazione periodica
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, TrendingUp, TrendingDown, Scale } from "lucide-react";
import { toast } from "sonner";

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

// Tipi documento vendite (attive)
const TIPI_VENDITE = ["fattura", "fattura_pa", "nota_credito", "nota_debito", "autofattura",
  "fattura_riepilogativa", "parcella", "fattura_accompagnatoria",
  "integrazione_servizi_estero", "integrazione_beni_ue", "integrazione_beni_extra_ue"];

function exportCSV(rows: any[], filename: string) {
  const headers = ["Data", "Numero", "Controparte", "Imponibile", "IVA", "Totale", "Aliquota IVA", "Natura"];
  const lines = [
    headers.join(";"),
    ...rows.map((r) =>
      [r.data, r.numero, r.controparte, r.imponibile.toFixed(2), r.iva.toFixed(2),
        r.totale.toFixed(2), r.aliquota, r.natura || ""].join(";")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RegistroIVA() {
  const companyId = useEffectiveCompanyId();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [anno, setAnno] = useState(currentYear);
  const [periodoType, setPeriodoType] = useState<"mensile" | "trimestrale">("mensile");
  const [mese, setMese] = useState(currentMonth);
  const [trimestre, setTrimestre] = useState(Math.ceil(currentMonth / 3));

  // Documenti fiscali (vendite/attivo)
  const { data: documentiVendite = [] } = useQuery({
    queryKey: ["registro-iva-vendite", companyId, anno],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documenti_fiscali" as never)
        .select("id, tipo, numero, data_emissione, cliente_snapshot, imponibile_totale, iva_totale, totale_documento, riepilogo_iva, stato")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .eq("anno", anno)
        .in("tipo", TIPI_VENDITE)
        .not("stato", "in", '("bozza","annullata")')
        .order("data_emissione", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  // Fatture ricevute (acquisti/passivo)
  const { data: documentiAcquisti = [] } = useQuery({
    queryKey: ["registro-iva-acquisti", companyId, anno],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fatture_ricevute" as never)
        .select("id, numero_fattura, data_fattura, cedente_ragione_sociale, imponibile_totale, iva_totale, totale_documento, riepilogo_iva")
        .eq("company_id", companyId!)
        .eq("anno", anno)
        .not("stato", "eq", "rifiutata")
        .order("data_fattura", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  // Filtro per periodo selezionato
  function inPeriod(dateStr: string): boolean {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const m = d.getMonth() + 1;
    if (periodoType === "mensile") return m === mese;
    return Math.ceil(m / 3) === trimestre;
  }

  // Espande righe riepilogo IVA per ciascun documento (vendite)
  const righeVendite = useMemo(() => {
    const rows: any[] = [];
    for (const doc of documentiVendite) {
      if (!inPeriod(doc.data_emissione)) continue;
      const riepilogo = doc.riepilogo_iva || [];
      if (riepilogo.length > 0) {
        for (const r of riepilogo) {
          rows.push({
            data: doc.data_emissione,
            numero: doc.numero,
            controparte: doc.cliente_snapshot?.ragione_sociale || "—",
            imponibile: parseFloat(r.imponibile) || 0,
            iva: parseFloat(r.imposta) || 0,
            totale: (parseFloat(r.imponibile) || 0) + (parseFloat(r.imposta) || 0),
            aliquota: r.aliquota || "0",
            natura: r.natura || "",
            tipo: doc.tipo,
          });
        }
      } else {
        // Fallback: usa totali documento
        rows.push({
          data: doc.data_emissione,
          numero: doc.numero,
          controparte: doc.cliente_snapshot?.ragione_sociale || "—",
          imponibile: doc.imponibile_totale || 0,
          iva: doc.iva_totale || 0,
          totale: doc.totale_documento || 0,
          aliquota: "—",
          natura: "",
          tipo: doc.tipo,
        });
      }
    }
    return rows;
  }, [documentiVendite, mese, trimestre, periodoType]);

  // Righe acquisti
  const righeAcquisti = useMemo(() => {
    const rows: any[] = [];
    for (const doc of documentiAcquisti) {
      if (!inPeriod(doc.data_fattura)) continue;
      const riepilogo = doc.riepilogo_iva || [];
      if (riepilogo.length > 0) {
        for (const r of riepilogo) {
          rows.push({
            data: doc.data_fattura,
            numero: doc.numero_fattura,
            controparte: doc.cedente_ragione_sociale || "—",
            imponibile: parseFloat(r.imponibile) || 0,
            iva: parseFloat(r.imposta) || 0,
            totale: (parseFloat(r.imponibile) || 0) + (parseFloat(r.imposta) || 0),
            aliquota: r.aliquota || "0",
            natura: r.natura || "",
          });
        }
      } else {
        rows.push({
          data: doc.data_fattura,
          numero: doc.numero_fattura,
          controparte: doc.cedente_ragione_sociale || "—",
          imponibile: doc.imponibile_totale || 0,
          iva: doc.iva_totale || 0,
          totale: doc.totale_documento || 0,
          aliquota: "—",
          natura: "",
        });
      }
    }
    return rows;
  }, [documentiAcquisti, mese, trimestre, periodoType]);

  // Totali liquidazione
  const totaleVendite = useMemo(() => ({
    imponibile: righeVendite.reduce((s, r) => s + r.imponibile, 0),
    iva: righeVendite.reduce((s, r) => s + r.iva, 0),
  }), [righeVendite]);

  const totaleAcquisti = useMemo(() => ({
    imponibile: righeAcquisti.reduce((s, r) => s + r.imponibile, 0),
    iva: righeAcquisti.reduce((s, r) => s + r.iva, 0),
  }), [righeAcquisti]);

  const saldoIVA = totaleVendite.iva - totaleAcquisti.iva;

  const periodoLabel = periodoType === "mensile"
    ? `${MESI[mese - 1]} ${anno}`
    : `${trimestre}° trimestre ${anno}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Registro IVA</h1>
          <p className="text-sm text-muted-foreground">Liquidazione IVA acquisti e vendite — {periodoLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Anno */}
          <Select value={String(anno)} onValueChange={(v) => setAnno(parseInt(v))}>
            <SelectTrigger className="w-[90px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Tipo periodo */}
          <Select value={periodoType} onValueChange={(v) => setPeriodoType(v as any)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mensile">Mensile</SelectItem>
              <SelectItem value="trimestrale">Trimestrale</SelectItem>
            </SelectContent>
          </Select>
          {/* Selezione mese o trimestre */}
          {periodoType === "mensile" ? (
            <Select value={String(mese)} onValueChange={(v) => setMese(parseInt(v))}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESI.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={String(trimestre)} onValueChange={(v) => setTrimestre(parseInt(v))}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1° Trimestre</SelectItem>
                <SelectItem value="2">2° Trimestre</SelectItem>
                <SelectItem value="3">3° Trimestre</SelectItem>
                <SelectItem value="4">4° Trimestre</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* KPI Liquidazione */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-blue-500" /> IVA a debito (vendite)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatCurrency(totaleVendite.iva)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Imponibile: {formatCurrency(totaleVendite.imponibile)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-4 w-4 text-orange-500" /> IVA a credito (acquisti)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatCurrency(totaleAcquisti.iva)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Imponibile: {formatCurrency(totaleAcquisti.imponibile)}</p>
          </CardContent>
        </Card>
        <Card className={saldoIVA > 0 ? "border-destructive/30" : "border-emerald-300/50"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Scale className="h-4 w-4" />
              {saldoIVA > 0 ? "IVA da versare" : "IVA a credito"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold tabular-nums ${saldoIVA > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
              {formatCurrency(Math.abs(saldoIVA))}
            </div>
            <Badge variant={saldoIVA > 0 ? "destructive" : "outline"} className="mt-1 text-[10px]">
              {saldoIVA > 0 ? "Da versare entro scadenza" : "Riporto a credito"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Tabelle */}
      <Tabs defaultValue="vendite">
        <div className="flex items-center justify-between mb-3">
          <TabsList>
            <TabsTrigger value="vendite">Registro Vendite ({righeVendite.length})</TabsTrigger>
            <TabsTrigger value="acquisti">Registro Acquisti ({righeAcquisti.length})</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const tab = document.querySelector<HTMLButtonElement>('[data-state="active"][role="tab"]');
                const isAcquisti = tab?.textContent?.includes("Acquisti");
                exportCSV(
                  isAcquisti ? righeAcquisti : righeVendite,
                  `registro-iva-${isAcquisti ? "acquisti" : "vendite"}-${periodoLabel.replace(/ /g, "_")}.csv`
                );
                toast.success("CSV esportato");
              }}
            >
              <Download className="h-3.5 w-3.5 mr-1" /> Esporta CSV
            </Button>
          </div>
        </div>

        <TabsContent value="vendite">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Numero</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Imponibile</TableHead>
                    <TableHead className="text-right">IVA</TableHead>
                    <TableHead className="text-right">Totale</TableHead>
                    <TableHead>Aliquota</TableHead>
                    <TableHead>Natura</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {righeVendite.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Nessuna operazione nel periodo selezionato
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {righeVendite.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{r.data}</TableCell>
                          <TableCell className="font-mono text-xs">{r.numero}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">{r.controparte}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatCurrency(r.imponibile)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatCurrency(r.iva)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs font-medium">{formatCurrency(r.totale)}</TableCell>
                          <TableCell className="text-xs">{r.aliquota !== "—" ? `${r.aliquota}%` : "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.natura || "—"}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-medium">
                        <TableCell colSpan={3} className="text-xs font-bold">TOTALE</TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-bold">{formatCurrency(totaleVendite.imponibile)}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-bold text-blue-600 dark:text-blue-400">{formatCurrency(totaleVendite.iva)}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-bold">{formatCurrency(totaleVendite.imponibile + totaleVendite.iva)}</TableCell>
                        <TableCell colSpan={2} />
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="acquisti">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Numero</TableHead>
                    <TableHead>Fornitore</TableHead>
                    <TableHead className="text-right">Imponibile</TableHead>
                    <TableHead className="text-right">IVA</TableHead>
                    <TableHead className="text-right">Totale</TableHead>
                    <TableHead>Aliquota</TableHead>
                    <TableHead>Natura</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {righeAcquisti.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Nessuna fattura ricevuta nel periodo selezionato
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {righeAcquisti.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{r.data}</TableCell>
                          <TableCell className="font-mono text-xs">{r.numero}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">{r.controparte}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatCurrency(r.imponibile)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatCurrency(r.iva)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs font-medium">{formatCurrency(r.totale)}</TableCell>
                          <TableCell className="text-xs">{r.aliquota !== "—" ? `${r.aliquota}%` : "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.natura || "—"}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-medium">
                        <TableCell colSpan={3} className="text-xs font-bold">TOTALE</TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-bold">{formatCurrency(totaleAcquisti.imponibile)}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-bold text-orange-600 dark:text-orange-400">{formatCurrency(totaleAcquisti.iva)}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-bold">{formatCurrency(totaleAcquisti.imponibile + totaleAcquisti.iva)}</TableCell>
                        <TableCell colSpan={2} />
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Nota legale */}
      <p className="text-xs text-muted-foreground text-center pb-4">
        Dati a titolo informativo. Verificare con il proprio commercialista prima di procedere alla liquidazione IVA periodica.
      </p>
    </div>
  );
}
