import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { raggruppaPerMese, type EmessaImportata } from "@/lib/fatturazione/emesseImportate";

const dataBreve = (s: string | null) => {
  if (!s) return "—";
  const [a, m, g] = s.slice(0, 10).split("-");
  return a && m && g ? `${g}/${m}/${a}` : s;
};

/**
 * Le fatture emesse con un altro programma (Aruba, Fatture in Cloud…) e importate
 * da XML, mese per mese. Sola lettura: servono a consultare lo storico.
 */
export default function FattureEmesseImportate() {
  const companyId = useEffectiveCompanyId();
  const [cerca, setCerca] = useState("");

  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["fatture-emesse-importate", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select("id, invoice_number, document_type, status, client_company_name, issue_date, subtotal, tax_amount, total, paid_amount")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("issue_date", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as EmessaImportata[];
    },
  });

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return data;
    return data.filter((f) => `${f.invoice_number} ${f.client_company_name ?? ""}`.toLowerCase().includes(q));
  }, [data, cerca]);
  const mesi = useMemo(() => raggruppaPerMese(filtrate), [filtrate]);
  const totale = useMemo(() => mesi.reduce((s, m) => s + m.totale, 0), [mesi]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link to="/azienda/documenti"><ArrowLeft className="h-4 w-4" /> Fatture</Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold">Fatture emesse importate</h1>
          <p className="text-sm text-muted-foreground">
            Emesse con un altro programma (Aruba, Fatture in Cloud…) e importate dall'XML. Sola lettura, mese per mese.
          </p>
        </div>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca numero o cliente…" className="h-9 pl-8" />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : isError ? (
        <p className="text-sm text-destructive">Non riesco a caricare le fatture. Riprova tra poco.</p>
      ) : mesi.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nessuna fattura importata{cerca ? " con questa ricerca" : ""}.</CardContent></Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {filtrate.length} fatture · totale <span className="font-semibold tabular-nums text-foreground">{formatCurrency(totale)}</span>
          </p>
          {mesi.map((m, i) => (
            <details key={m.chiave} open={i < 3 || !!cerca} className="rounded-xl border bg-card">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="font-semibold">{m.etichetta}</span>
                <span className="text-xs text-muted-foreground">{m.fatture.length} fatture</span>
                <span className="ml-auto text-sm font-semibold tabular-nums">{formatCurrency(m.totale)}</span>
                <span className="w-full text-xs text-muted-foreground sm:w-auto">
                  Imponibile {formatCurrency(m.imponibile)} · IVA {formatCurrency(m.iva)}
                </span>
              </summary>
              <div className="overflow-x-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Numero</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Imponibile</TableHead>
                      <TableHead className="text-right">IVA</TableHead>
                      <TableHead className="text-right">Totale</TableHead>
                      <TableHead className="text-right">Incassato</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {m.fatture.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs font-semibold text-orange-600">
                          {f.invoice_number}{f.document_type === "TD04" ? " · NC" : ""}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate text-xs">{f.client_company_name || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{dataBreve(f.issue_date)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{formatCurrency(Number(f.subtotal ?? 0))}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{formatCurrency(Number(f.tax_amount ?? 0))}</TableCell>
                        <TableCell className="text-right text-xs font-medium tabular-nums">{formatCurrency(Number(f.total ?? 0))}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{Number(f.paid_amount ?? 0) > 0 ? formatCurrency(Number(f.paid_amount)) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          ))}
        </>
      )}
    </div>
  );
}
