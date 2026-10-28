import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FiscalQueryState } from "./FiscalQueryState";
import { Button } from "@/components/ui/button";
import { fiscalBucket, fiscalNumber } from "@/lib/fatturazione/fiscalWorkspace";
import { formatCurrency } from "@/lib/formatters";
import { Link } from "react-router-dom";
import { fiscalDate } from "@/lib/fatturazione/fiscalInsights";
export function FiscalSourceViewer({
  id,
  label,
  type,
}: {
  id: string;
  label: string;
  type: "vendite" | "acquisti";
}) {
  const company = useEffectiveCompanyId(),
    [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["fiscal-original", company, type, id],
    enabled: open && !!company,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(type === "acquisti" ? "fatture_ricevute" : "documenti_fiscali")
        .select(
          type === "acquisti"
            ? "id,numero_fattura,data_fattura,data_ricezione_sdi,cedente_ragione_sociale,imponibile_totale,iva_totale,totale_documento,riepilogo_iva,stato,xml_raw"
            : "id,numero,data_emissione,cliente_snapshot,imponibile_totale,iva_totale,totale_documento,riepilogo_iva,sdi_stato,stato",
        )
        .eq("company_id", company!)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as Record<string, unknown>;
    },
  });
  const xml = q.data?.xml_raw;
  const source = q.data || {};
  const sourceMoney = (value: unknown) => {
    const n = fiscalNumber(value);
    return n === null ? "Da verificare" : formatCurrency(n);
  };
  return (
    <>
      <button
        className="text-left font-medium text-blue-700 underline-offset-4 hover:underline"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Documento sorgente · {label}</DialogTitle>
            <DialogDescription>
              Dati letti dal gestionale per l’azienda corrente. Non sono una
              ricevuta fiscale o una verifica di conservazione.
            </DialogDescription>
          </DialogHeader>
          {q.isPending || q.isError ? (
            <FiscalQueryState
              loading={q.isPending}
              error={q.isError}
              onRetry={() => void q.refetch()}
            />
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[
                  [
                    "Data documento",
                    fiscalDate(source.data_fattura || source.data_emissione),
                  ],
                  ["Stato gestionale", source.stato || "Non disponibile"],
                  ["Imponibile", sourceMoney(source.imponibile_totale)],
                  ["IVA", sourceMoney(source.iva_totale)],
                  ["Totale documento", sourceMoney(source.totale_documento)],
                  [
                    "Ricezione SDI",
                    fiscalDate(source.data_ricezione_sdi, "Non documentata"),
                  ],
                ].map(([label, value]) => (
                  <div className="rounded-lg border p-3" key={String(label)}>
                    <dt className="text-xs text-muted-foreground">
                      {String(label)}
                    </dt>
                    <dd className="mt-1 break-words font-medium">
                      {String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
              {Array.isArray(source.riepilogo_iva) && (
                <div className="space-y-2">
                  {source.riepilogo_iva.map((raw, i) => {
                    const b = fiscalBucket(raw);
                    return (
                      <p key={i} className="rounded-lg bg-slate-50 p-3 text-sm">
                        Aliquota{" "}
                        {b.rate === null ? "da verificare" : b.rate + "%"} ·{" "}
                        {b.nature ||
                          "operazione imponibile / natura non indicata"}{" "}
                        · IVA{" "}
                        {b.tax === null
                          ? "da verificare"
                          : formatCurrency(b.tax / 100)}
                      </p>
                    );
                  })}
                </div>
              )}
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Dati sorgente e identificatore documento
                </summary>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-4 text-xs">
                  {JSON.stringify(
                    Object.fromEntries(
                      Object.entries(q.data || {}).filter(
                        ([key]) => key !== "xml_raw",
                      ),
                    ),
                    null,
                    2,
                  )}
                </pre>
              </details>
              {type === "vendite" && (
                <Button asChild variant="outline">
                  <Link to={`/azienda/documenti/${id}/dettaglio`}>
                    Apri documento completo
                  </Link>
                </Button>
              )}
              {typeof xml === "string" && xml.trim() ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([xml], { type: "application/xml" }),
                    );
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `originale-${id}.xml`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  Scarica XML presente nel gestionale
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  XML non disponibile in questa scheda. I dati a video non lo
                  sostituiscono.
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
