/** «Quante ne mancano»: buchi nella numerazione delle emesse e mesi sospetti, a colpo d'occhio. */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateShort } from "@/lib/formatters";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { buchiNumerazione, fatturePerMese, fuoriSequenza, testoIntervalli, totaleMancanti, type DocumentoNumerato } from "@/lib/fatturazione/completezzaFatture";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

/**
 * «Ho controllato»: l'avviso si può togliere, e torna se i numeri cambiano (16/11/2026).
 *
 * All'Impresa Vulcano le emesse sono state importate dal vecchio gestionale: 59 numeri saltati
 * che non si riempiranno mai, in cima alle Fatture Ricevute, senza modo di chiuderli. Chi ha
 * guardato i buchi una volta non deve rivederli per sempre — ma se ne salta uno nuovo, l'avviso
 * deve tornare. Perciò si ricorda il conto esatto che è stato visto, non un semplice «nascosto».
 */
const CHIAVE_VISTO = (companyId: string) => `eic.completezza-fatture.visto.${companyId}`;

function leggiVisto(companyId: string): string | null {
  try { return localStorage.getItem(CHIAVE_VISTO(companyId)); } catch { return null; }
}
function segnaVisto(companyId: string, firma: string): void {
  try { localStorage.setItem(CHIAVE_VISTO(companyId), firma); } catch { /* niente: l'avviso resta */ }
}

const ETICHETTA_MESE = (k: string) => new Date(`${k}-15`).toLocaleDateString(intlCampo(), { month: "short", year: "2-digit" });

function Mesi({ titolo, date, oggi }: { titolo: string; date: Array<string | null>; oggi: string }) {
  const t = useT();
  const mesi = useMemo(() => fatturePerMese(date, oggi), [date, oggi]);
  if (!mesi.length) return null;
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{titolo}</p>
      <div className="flex flex-wrap gap-1.5">
        {mesi.map((m) => (
          <span key={m.mese} title={m.sospetto ? t("Molto sotto la media: controlla se mancano fatture") : undefined}
            className={`rounded border px-1.5 py-0.5 text-xs tabular-nums ${m.sospetto ? "border-amber-400 bg-amber-50 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "text-muted-foreground"}`}>
            {ETICHETTA_MESE(m.mese)} · {m.quante}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CompletezzaFatture({ companyId }: { companyId: string }) {
  const t = useT();
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
  // Quello che si sta guardando adesso: se cambia, l'avviso torna anche se era stato tolto.
  const firma = `${mancanti}-${mesiSospetti}-${fuori.length}`;
  const [visto, setVisto] = useState<string | null>(() => leggiVisto(companyId));
  if (!data || (!docs.length && !dateRicevute.length)) return null;
  const tuttoOk = mancanti === 0 && mesiSospetti === 0 && fuori.length === 0;
  if (visto === firma) return null;
  return (
    <Card className={tuttoOk ? undefined : "border-amber-300"}>
      <CardContent className="flex items-start gap-2 px-3 py-1.5">
        <div className="min-w-0 flex-1">
        <button type="button" className="flex w-full items-center gap-2 text-left text-sm font-medium" aria-expanded={aperto} onClick={() => setAperto((v) => !v)}>
          {tuttoOk ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
          <span className="flex-1">
            {tuttoOk
              ? t("Fatture complete: nessun numero saltato")
              : [mancanti > 0 ? `Mancano ${mancanti} numeri nelle emesse` : null, mesiSospetti > 0 ? `${mesiSospetti} mesi da controllare` : null, fuori.length > 0 ? `${fuori.length} fuori ordine` : null].filter(Boolean).join(" · ")}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${aperto ? "rotate-180" : ""}`} />
        </button>
        {aperto && (
          <div className="mt-3 space-y-3 text-sm">
            {buchi.filter((b) => b.mancanti.length > 0).map((b) => (
              <p key={`${b.anno}${b.serie}`}><span className="font-medium">{t("Emesse {anno}, {n} mancanti:", { anno: b.anno, n: b.mancanti.length })}</span> {testoIntervalli(b)}</p>
            ))}
            {fuori.length > 0 && (
              <p><span className="font-medium">{t("Numero alto ma data vecchia:")}</span> {fuori.slice(0, 20).map((d) => t("{numero} del {data}", { numero: d.numero ?? "", data: d.data ? formatDateShort(d.data) : "?" })).join(", ")}</p>
            )}
            <Mesi titolo={t("Emesse per mese")} date={dateEmesse} oggi={oggi} />
            <Mesi titolo={t("Ricevute per mese")} date={dateRicevute} oggi={oggi} />
            <p className="text-xs text-muted-foreground">
              {t("Un numero saltato può essere una fattura non caricata, o annullata. Sulle ricevute la numerazione è di ogni fornitore: si può solo segnalare il mese sospetto, la prova certa è il cassetto fiscale.")}
            </p>
          </div>
        )}
        </div>
        <button
          type="button"
          aria-label={t("Ho controllato, non mostrare più questo avviso")}
          title={t("Ho controllato: torna solo se i numeri cambiano")}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => { segnaVisto(companyId, firma); setVisto(firma); }}
        >
          <X className="h-4 w-4" />
        </button>
      </CardContent>
    </Card>
  );
}
