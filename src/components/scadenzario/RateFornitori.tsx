import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { exportToCSV } from "@/lib/csvExport";
import { colonneRateFornitori, filtraRateFornitori, rataDaPagare, ribaDaContabilizzare, righeRateFornitori, statoRataFornitore, type RataFornitore } from "@/lib/fatturazione/rateFornitoriScadenzario";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { etichettaMetodo, gruppoMetodo } from "@/lib/finance/metodoScadenza";
import { formatCurrency, formatDateIt } from "@/lib/formatters";

import { PagaRataDialog, type RataDaPagare } from "./PagaRataDialog";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const RiepilogoFatturaRicevuta = lazy(() => import("@/components/fatturazione/RiepilogoFatturaRicevuta").then(m => ({ default: m.RiepilogoFatturaRicevuta })));

export function RateFornitori({ companyId, anno, cerca }: { companyId: string; anno: string; cerca: string }) {
  const t = useT();
  const [fattura, setFattura] = useState<string | null>(null);
  const [soloRiba, setSoloRiba] = useState(false);
  const [soloAperte, setSoloAperte] = useState(true);
  const [da, setDa] = useState("");
  const [a, setA] = useState("");
  const [soloSenzaData, setSoloSenzaData] = useState(false);
  const [scelta, setScelta] = useState<RataDaPagare | null>(null);
  const permessi = usePermissions();
  const rate = useQuery({
    queryKey: ["scadenzario", "rate-fornitori", companyId, "residui"],
    queryFn: async (): Promise<RataFornitore[]> => {
      const righe = await tutteLePagine((from, to) => supabase.rpc("scadenzario_rate_fornitori", { p_company_id: companyId })
        .order("scadenza", { nullsFirst: false }).order("id").range(from, to));
      return righe.map(r => ({
        ...r,
        fatture_ricevute: r.fattura_id
          ? { id: r.fattura_id, numero_fattura: r.numero_fattura, cedente_ragione_sociale: r.fornitore }
          : null,
      }));
    },
  });
  const daContabilizzare = useQuery({
    queryKey: ["fatture-ricevute", "piano-riba", companyId],
    enabled: soloRiba && permessi.canViewBilling,
    queryFn: () => tutteLePagine((from, to) => supabase.from("fatture_ricevute")
      .select("id, numero_fattura, cedente_ragione_sociale, tipo_documento, piano_pagamento, pagata_il")
      .eq("company_id", companyId).is("company_cost_id", null).not("stato", "in", "(annullata,scartata,rifiutata,contabilizzata)")
      // Il filtro di contenimento JSONB richiede un valore JSON serializzato.
      .contains("piano_pagamento", JSON.stringify([{ modalita: "MP12" }])).order("id").range(from, to)),
  });
  const includeNonContabilizzate = soloRiba && permessi.canViewBilling;
  const inCaricamento = rate.isLoading || (soloRiba && permessi.isLoading) || (includeNonContabilizzate && daContabilizzare.isLoading);
  const inAggiornamento = rate.isFetching || (includeNonContabilizzate && daContabilizzare.isFetching);
  const errore = rate.isError || (includeNonContabilizzate && daContabilizzare.isError);
  const caricate = useMemo(() => {
    const registrate: RataFornitore[] = rate.data ?? [];
    if (!includeNonContabilizzate) return registrate;
    const collegate = new Set(registrate.map(r => r.fatture_ricevute?.id));
    const inFattura = (daContabilizzare.data ?? []).filter(f => !collegate.has(f.id)).flatMap(ribaDaContabilizzare);
    return [...registrate, ...inFattura].sort((r, s) =>
      (r.scadenza ?? "9999-12-31").localeCompare(s.scadenza ?? "9999-12-31") || r.id.localeCompare(s.id));
  }, [rate.data, daContabilizzare.data, includeNonContabilizzate]);
  const residui = new Map<string, number | null>();
  for (const r of caricate) {
    const id = r.fatture_ricevute?.id;
    if (!id) continue;
    const precedente = residui.get(id);
    residui.set(id, precedente === null || r.residuo == null ? null : (precedente ?? 0) + Math.round(r.residuo * 100));
  }
  const dateInvertite = !soloSenzaData && !!da && !!a && da > a;
  const filtri = { anno, da, a, soloAperte, soloRiba, cerca, soloSenzaData };
  const senzaData = filtraRateFornitori(caricate, { ...filtri, soloSenzaData: true });
  const righe = soloSenzaData ? senzaData : dateInvertite ? [] : filtraRateFornitori(caricate, filtri);
  const totale = righe.reduce((c, r) => c + (rataDaPagare(r) ? Math.round((r.residuo ?? 0) * 100) : 0), 0) / 100;
  const senzaResiduo = righe.filter(r => rataDaPagare(r) && r.residuo == null).length;
  const dataOggi = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const impostaMese = (scarto: number) => {
    const [annoOggi, meseOggi] = dataOggi.split("-").map(Number);
    const mese = meseOggi + scarto;
    setSoloSenzaData(false);
    setDa(new Date(Date.UTC(annoOggi, mese - 1, 1)).toISOString().slice(0, 10));
    setA(new Date(Date.UTC(annoOggi, mese, 0)).toISOString().slice(0, 10));
  };
  const esporta = () => {
    const periodo = soloSenzaData ? "-senza-data" : da || a ? `-${da || "inizio"}-${a || "fine"}` : anno === "all" ? "" : `-${anno}`;
    exportToCSV(righeRateFornitori(righe), colonneRateFornitori, `${soloRiba ? "riba-fornitori" : "rate-fornitori"}${periodo}.csv`);
  };
  return <section aria-label={t("Rate fornitori")} className="space-y-3">
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
      <div className="space-y-1">
        <Label htmlFor="rate-da" className="text-xs">{t("Scadenza dal")}</Label>
        <Input id="rate-da" type="date" value={da} onChange={e => setDa(e.target.value)} disabled={soloSenzaData} className="h-8 w-auto" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="rate-a" className="text-xs">{t("Al")}</Label>
        <Input id="rate-a" type="date" value={a} min={da || undefined} onChange={e => setA(e.target.value)} disabled={soloSenzaData} className="h-8 w-auto" />
      </div>
      <Button size="sm" variant="outline" onClick={() => impostaMese(0)}>{t("Questo mese")}</Button>
      <Button size="sm" variant="outline" onClick={() => impostaMese(1)}>{t("Mese prossimo")}</Button>
      {(da || a) && !soloSenzaData && <Button size="sm" variant="ghost" onClick={() => { setDa(""); setA(""); }}>{t("Azzera date")}</Button>}
      <Button size="sm" variant={soloSenzaData ? "secondary" : "outline"} aria-pressed={soloSenzaData} onClick={() => setSoloSenzaData(!soloSenzaData)}>
        {t("Senza data")}{!inCaricamento && !errore && senzaData.length > 0 ? ` (${senzaData.length})` : ""}
      </Button>
      <Button size="sm" variant={soloAperte ? "secondary" : "outline"} aria-pressed={soloAperte} onClick={() => setSoloAperte(!soloAperte)}>{t("Solo da pagare")}</Button>
      <Button size="sm" variant={soloRiba ? "secondary" : "outline"} aria-pressed={soloRiba} onClick={() => setSoloRiba(!soloRiba)}>{t("Solo Ri.Ba.")}</Button>
      <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={esporta} disabled={!righe.length || inCaricamento || inAggiornamento || errore}>
        <Download className="h-4 w-4" aria-hidden="true" /> {t("Esporta CSV")}
      </Button>
    </div>
    {dateInvertite && <p role="alert" className="text-sm text-destructive">{t("La data finale deve essere uguale o successiva a quella iniziale.")}</p>}
    {!inCaricamento && !errore && righe.length > 0 && <p className="text-sm">
      {t(righe.length === 1 ? "{n} rata" : "{n} rate", { n: righe.length })} · {t("Da pagare")} <strong>{totale === 0 && senzaResiduo ? "—" : formatCurrency(totale)}</strong>
      {senzaResiduo > 0 && ` · Residuo non disponibile per ${senzaResiduo} ${senzaResiduo === 1 ? "rata" : "rate"}`}
    </p>}
    {errore ? <Button variant="outline" onClick={() => {
      void rate.refetch();
      if (includeNonContabilizzate) void daContabilizzare.refetch();
    }}>{t("Errore nel caricamento · Riprova")}</Button> :
      inCaricamento ? <p>{t("Caricamento rate…")}</p> : !righe.length ? <p className="p-3 text-sm">{t("Nessuna rata per i filtri scelti.")}</p> :
      <div className="overflow-x-auto rounded-lg border"><table className="w-full whitespace-nowrap text-left text-sm [&_td]:px-3 [&_th]:px-3 [&_td]:py-1.5">
        <thead className="bg-muted/50 text-xs"><tr>{["Scadenza", "Modalità", "Fattura ricevuta", "Rata", "Da pagare", "Residuo fattura", "Fornitore", "Importo rata", "Stato", "Azioni"].map(h => <th key={h} className="py-2">{h}</th>)}</tr></thead>
        <tbody>{righe.map(r => {
          const f = r.fatture_ricevute;
          const importo = r.importo == null ? "—" : formatCurrency(r.importo);
          const daPagare = !rataDaPagare(r) ? formatCurrency(0) : r.residuo == null ? "—" : formatCurrency(r.residuo);
          return <tr key={r.id} className="border-t">
            <td>{r.scadenza ? formatDateIt(r.scadenza) : "—"}</td>
            <td>{gruppoMetodo(r.metodo) === "riba" ? <strong className="rounded bg-sky-100 px-2 py-0.5 text-sky-800">Ri.Ba.</strong> : etichettaMetodo(r.metodo) ?? "—"}</td>
            <td>{f ? <button className="text-primary hover:underline" onClick={() => setFattura(f.id)}>{f.numero_fattura || t("Apri fattura")}</button> : "—"}</td>
            <td>{r.numero}</td><td className="font-semibold tabular-nums">{daPagare}</td>
            <td className="tabular-nums">{f && !r.id.startsWith("xml:") && residui.get(f.id) !== null ? formatCurrency((residui.get(f.id) ?? 0) / 100) : "—"}</td>
            <td>{r.fornitore ?? "—"}</td><td>{importo}</td><td className="capitalize">{statoRataFornitore(r)}</td>
            <td>{rataDaPagare(r) && r.updated_at && r.importo != null && permessi.canViewCosts && !permessi.solaLettura &&
              <Button size="sm" variant="outline" onClick={() => {
                if (r.importo == null || !r.updated_at) return;
                setScelta({ id: r.id, stato: r.stato, importo: r.importo, updated_at: r.updated_at,
                  titolo: `Rata ${r.numero} · ${f?.numero_fattura || r.fornitore || "Fornitore"} · Residuo ${daPagare}` });
              }}>{t("Segna pagata")}</Button>}</td>
          </tr>;
        })}</tbody>
      </table></div>}
    {scelta && <PagaRataDialog companyId={companyId} scelta={scelta} onClose={() => setScelta(null)} />}
    {fattura && <Suspense fallback={<p>{t("Caricamento fattura…")}</p>}><RiepilogoFatturaRicevuta companyId={companyId} fatturaId={fattura} onClose={() => setFattura(null)} /></Suspense>}
  </section>;
}
