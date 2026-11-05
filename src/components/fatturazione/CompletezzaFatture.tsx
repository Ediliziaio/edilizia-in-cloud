/** «Quante ne mancano»: buchi nella numerazione delle emesse e mesi sospetti, a colpo d'occhio. */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateShort } from "@/lib/formatters";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { buchiNumerazione, fatturePerMese, fuoriSequenza, testoIntervalli, totaleMancanti, type DocumentoNumerato } from "@/lib/fatturazione/completezzaFatture";

const ETICHETTA_MESE = (k: string) => new Date(`${k}-15`).toLocaleDateString("it-IT", { month: "short", year: "2-digit" });

function Mesi({ titolo, date, oggi }: { titolo: string; date: Array<string | null>; oggi: string }) {
  const mesi = useMemo(() => fatturePerMese(date, oggi), [date, oggi]);
  if (!mesi.length) return null;
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{titolo}</p>
      <div className="flex flex-wrap gap-1.5">
        {mesi.map((m) => (
          <span key={m.mese} title={m.sospetto ? "Molto sotto la media: controlla se mancano fatture" : undefined}
            className={`rounded border px-1.5 py-0.5 text-xs tabular-nums ${m.sospetto ? "border-amber-400 bg-amber-50 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "text-muted-foreground"}`}>
            {ETICHETTA_MESE(m.mese)} · {m.quante}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CompletezzaFatture({ companyId }: { companyId: string }) {
  const [aperto, setAperto] = useState(false);
  const oggi = useMemo(() => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }), []);
  const { data } = useQuery({
    queryKey: ["fatture-ricevute", "completezza", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [emesse, ricevute] = await Promise.all([
        tutteLePagine<{ id: string; numero: string | null; data_emissione: string | null }>((from, to) => db.from("documenti_fiscali_elenco_con_importate")
          .select("id, numero, data_emissione").eq("company_id", companyId).is("deleted_at", null)
          .in("tipo", ["fattura", "fattura_accompagnatoria", "nota_credito", "nota_debito", "parcella"]).not("stato", "in", "(bozza)")
          .order("id").range(from, to)),
        tutteLePagine<{ id: string; data_fattura: string | null }>((from, to) => db.from("fatture_ricevute")
          .select("id, data_fattura").eq("company_id", companyId).order("id").range(from, to)),
      ]);
      return { emesse, ricevute };
    },
  });
  const docs: DocumentoNumerato[] = useMemo(() => (data?.emesse ?? []).map((d) => ({ numero: d.numero, data: d.data_emissione })), [data]);
  const buchi = useMemo(() => buchiNumerazione(docs), [docs]);
  const fuori = useMemo(() => fuoriSequenza(docs), [docs]);
  const dateEmesse = useMemo(() => docs.map((d) => d.data), [docs]);
  const dateRicevute = useMemo(() => (data?.ricevute ?? []).map((r) => r.data_fattura), [data]);
  const mancanti = totaleMancanti(buchi);
  const mesiSospetti = useMemo(() => [...fatturePerMese(dateEmesse, oggi), ...fatturePerMese(dateRicevute, oggi)].filter((m) => m.sospetto).length, [dateEmesse, dateRicevute, oggi]);
  if (!data || (!docs.length && !dateRicevute.length)) return null;
  const tuttoOk = mancanti === 0 && mesiSospetti === 0 && fuori.length === 0;
  return (
    <Card className={tuttoOk ? undefined : "border-amber-300"}>
      <CardContent className="p-3">
        <button type="button" className="flex w-full items-center gap-2 text-left text-sm font-medium" aria-expanded={aperto} onClick={() => setAperto((v) => !v)}>
          {tuttoOk ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
          <span className="flex-1">
            {tuttoOk
              ? "Fatture complete: nessun numero saltato"
              : [mancanti > 0 ? `Mancano ${mancanti} numeri nelle emesse` : null, mesiSospetti > 0 ? `${mesiSospetti} mesi da controllare` : null, fuori.length > 0 ? `${fuori.length} fuori ordine` : null].filter(Boolean).join(" · ")}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${aperto ? "rotate-180" : ""}`} />
        </button>
        {aperto && (
          <div className="mt-3 space-y-3 text-sm">
            {buchi.filter((b) => b.mancanti.length > 0).map((b) => (
              <p key={`${b.anno}${b.serie}`}><span className="font-medium">Emesse {b.anno}, {b.mancanti.length} mancanti:</span> {testoIntervalli(b)}</p>
            ))}
            {fuori.length > 0 && (
              <p><span className="font-medium">Numero alto ma data vecchia:</span> {fuori.slice(0, 20).map((d) => `${d.numero} del ${d.data ? formatDateShort(d.data) : "?"}`).join(", ")}</p>
            )}
            <Mesi titolo="Emesse per mese" date={dateEmesse} oggi={oggi} />
            <Mesi titolo="Ricevute per mese" date={dateRicevute} oggi={oggi} />
            <p className="text-xs text-muted-foreground">
              Un numero saltato può essere una fattura non caricata, o annullata. Sulle ricevute la numerazione è di ogni fornitore: si può solo segnalare il mese sospetto, la prova certa è il cassetto fiscale.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
