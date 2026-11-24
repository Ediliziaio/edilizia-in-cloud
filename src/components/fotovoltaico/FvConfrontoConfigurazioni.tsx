import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { proposteImpiantoFv, PropostaImpiantoFv } from "@/lib/fotovoltaico/proposteImpianto";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const n = (v: number, d = 0) => v.toLocaleString(intlCampo(), { maximumFractionDigits: d, useGrouping: "always" });
const euro = (v: number) => new Intl.NumberFormat(intlCampo(), { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(v);
const titoli = { contenuta: "Investimento contenuto", consigliata: "Proposta per il tuo obiettivo", accumulo: "Con accumulo" };

export function FvConfrontoConfigurazioni({ confronto, modificabile, pannelliSalvati, selezionata, onScegli }: {
  confronto: NonNullable<ReturnType<typeof proposteImpiantoFv>>; modificabile: boolean; pannelliSalvati: number; selezionata?: string; onScegli: (s: PropostaImpiantoFv) => void;
}) {
  const t = useT();
  const [sostituzione, setSostituzione] = useState<PropostaImpiantoFv | null>(null);
  const propostaAttuale = sostituzione && confronto.proposte.find(s => s.id === sostituzione.id);
  const propostaCambiata = !!sostituzione && JSON.stringify(propostaAttuale) !== JSON.stringify(sostituzione);
  return <div className="mt-4">
    <p className="text-sm"><strong>{t("{confronti} taglie confrontate.", { confronti: String(confronto.confronti ?? "") })}</strong> {confronto.criterio}</p>
    {confronto.senzaMappa && <p className="mt-2 text-xs text-amber-800">{t("Il limite di confronto produce circa il fabbisogno annuo: lo spazio sul tetto non è stato verificato. Puoi disegnare le falde in seguito.")}</p>}
    {!confronto.prezziDisponibili && <p className="mt-2 text-xs text-amber-800">{t("Confronto energetico: completa prezzi e posa per valutare costo e saldo delle configurazioni.")}</p>}
    {!confronto.obiettivoRaggiunto && <p className="mt-2 text-xs text-amber-800">{t("Con le taglie, lo spazio e il profilo orario confrontati l’obiettivo energetico non è raggiunto.")}</p>}
    <div className="mt-3 grid gap-3 xl:grid-cols-3">
      {confronto.proposte.map(s => <article key={s.id} className="min-w-0 rounded-xl border border-slate-200 p-3">
        <h4 className="font-semibold">{t(titoli[s.id])}</h4>
        <p className="mt-2 text-sm">{s.configurazione.con_accumulo
          ? t("{pannelli} pannelli · {potenza} kWp · {accumulo} kWh accumulo", { pannelli: s.configurazione.numero_pannelli_scelti, potenza: n(s.configurazione.potenza_kwp, 2), accumulo: n(s.configurazione.capacita_accumulo_kwh, 1) })
          : t("{pannelli} pannelli · {potenza} kWp · senza accumulo", { pannelli: s.configurazione.numero_pannelli_scelti, potenza: n(s.configurazione.potenza_kwp, 2) })}</p>
        {s.id === "contenuta" && <p className="mt-2 text-xs text-slate-600">{t("Taglia più piccola tra quelle confrontate che conserva almeno il 60% del beneficio della proposta senza accumulo.")}</p>}
        <dl className="mt-3 space-y-2 text-xs">
          {[["Produzione annua", `${n(s.flussi.produzione)} kWh`], ["Energia autoconsumata", `${n(s.flussi.autoconsumo)} kWh`], ["Energia ancora acquistata", `${n(s.flussi.acquistata)} kWh`], ["Consumi coperti", `${n(s.flussi.coperturaConsumi * 100)}%`],
            ["Risparmio sugli acquisti", s.beneficio == null ? "Tariffa da confermare" : euro(s.flussi.risparmioAcquisti)], ["Valore immissioni, separato", euro(s.flussi.ricaviImmissione)],
            ["Costo voci inserite, IVA inclusa", s.prezzo == null ? "Prezzo da confermare" : euro(s.prezzo)], ["Rientro semplice", s.rientro == null ? "Dati insufficienti" : `${n(s.rientro, 1)} anni`],
            ["Saldo semplice a 10 anni", s.saldo10 == null ? "Dati insufficienti" : euro(s.saldo10)]].map(([k, v]) => <div key={k} className="flex flex-wrap justify-between gap-2"><dt>{k}</dt><dd className="font-medium">{v}</dd></div>)}
        </dl>
        {s.incrementoAccumulo && <div className="mt-3 rounded-lg bg-slate-50 p-2 text-xs"><strong>{t("Solo l’aggiunta della batteria")}</strong><p className="mt-1">{t("Costo aggiuntivo {costo} · beneficio aggiuntivo {beneficio}/anno.", { costo: euro(s.incrementoAccumulo.costo), beneficio: euro(s.incrementoAccumulo.beneficio) })}</p><p className={`mt-1 ${s.incrementoAccumulo.saldo10 < 0 ? "text-amber-800" : "text-emerald-800"}`}>{s.incrementoAccumulo.saldo10 < 0 ? t("Il beneficio aggiuntivo non recupera il costo della batteria nei 10 anni del confronto.") : t("Saldo aggiuntivo a 10 anni: {saldo10}.", { saldo10: euro(s.incrementoAccumulo.saldo10) })}</p></div>}
        {!s.posaValorizzata && <p className="mt-2 text-xs text-amber-800">{t("Posa da valorizzare: il rientro resta da verificare.")}</p>}
        {s.prezzoCorpoDaRivedere && <p className="mt-2 text-xs text-amber-800">{t("Il prezzo a corpo riguarda la configurazione precedente. Applicando questa proposta viene tolto e va riconfermato sul nuovo impianto.")}</p>}
        {s.saldo10 != null && s.saldo10 < 0 && <p className="mt-2 text-xs text-amber-800">{t("Nei 10 anni del confronto il beneficio non recupera l’investimento indicato.")}</p>}
        <Button type="button" variant={selezionata === s.id ? "default" : "outline"} className="mt-3 w-full whitespace-normal" disabled={!modificabile || s.configurazione.numero_pannelli_scelti < 1} onClick={() => pannelliSalvati > 0 ? setSostituzione(s) : onScegli(s)}>{t("Usa questa configurazione")}</Button>
      </article>)}
    </div>
    {!confronto.proposte.some(s => s.id === "accumulo") && <p className="mt-3 text-xs text-slate-600">{t("Per confrontare l’accumulo aggiungi al catalogo un modello con capacità e prezzo.")}</p>}
    <p className="mt-3 text-xs text-slate-500">{t("Il confronto usa il profilo orario e le voci inserite. Capacità utile e rendimento della batteria sono quelli del modello di simulazione; compatibilità elettrica, accessori, strutture e posa richiedono conferma.")}</p>
    <AlertDialog open={!!sostituzione} onOpenChange={open => { if (!open) setSostituzione(null); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("Sostituire la disposizione dei pannelli?")}</AlertDialogTitle><AlertDialogDescription>{propostaCambiata ? t("I dati del confronto sono cambiati. Chiudi questa conferma e scegli nuovamente la configurazione aggiornata.") : <>{t("La posa salvata contiene {pannelliSalvati} pannelli. La configurazione scelta applica {numero_pannelli_scelti} moduli nella disposizione proposta. Le falde e la foto restano quelle del progetto.", { pannelliSalvati: String(pannelliSalvati ?? ""), numero_pannelli_scelti: String(sostituzione?.configurazione.numero_pannelli_scelti ?? "") })}</>}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("Mantieni la posa salvata")}</AlertDialogCancel><AlertDialogAction disabled={propostaCambiata || !modificabile} onClick={() => { if (sostituzione && modificabile && !propostaCambiata) onScegli(sostituzione); setSostituzione(null); }}>{t("Applica la nuova disposizione")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </div>;
}
