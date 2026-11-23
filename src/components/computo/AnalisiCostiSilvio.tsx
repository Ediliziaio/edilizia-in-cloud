import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { risorseDaTariffaAnalisi, useAnalisiCostiPreventivo } from "@/hooks/useAnalisiCostiPreventivo";
import type { BozzaComputo, VoceEditor } from "@/lib/computo/editorNativo";
import { formatCurrency } from "@/lib/formatters";
import { analizzaPreventivo, categorieCosto, costoCompletoVoce, numeroCosto, quoteCostiComuni, soldi } from "@/lib/preventivi/analisiCosti";
import { economiaAnalisiComputo } from "@/lib/preventivi/analisiCostiEditor";
import { risorsaDaComandoCosto, type RichiestaCostoSilvio, type RiscontroCostoSilvio } from "@/lib/preventivi/modificaCostoSilvio";
import ConfrontoModificaCostoSilvio from "./ConfrontoModificaCostoSilvio";
import ProposteCostiMultiple, { type RichiestaProposteCosti } from "@/components/quotes/ProposteCostiMultiple";
import { applicaModificheAnalisi, type ModificaAnalisiProposta } from "@/lib/preventivi/anteprimaAnalisiCosti";
import { motivoVoceDaCompletare } from "@/lib/preventivi/proposteAnalisiCosti";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const numero = new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 3 });
const percentuale = new Intl.NumberFormat(intlCampo(), { style: "percent", maximumFractionDigits: 2 });
const importo = (n: number | null) => n === null ? "—" : formatCurrency(n);
const differenza = (n: number) => (n > 0 ? "+" : "") + formatCurrency(n);

type Modifica = { id: number; voce: string; risorse: { id: string; prezzo: string }[]; versione: number };

export default function AnalisiCostiSilvio({ companyId, draftId, bozza, proposta, puoModificare = false, richiesta, onRiscontro }: {
  companyId: string;
  draftId: string;
  bozza: BozzaComputo;
  proposta?: VoceEditor[];
  puoModificare?: boolean;
  richiesta?: RichiestaCostoSilvio | null;
  onRiscontro?: (id: number, riscontro: RiscontroCostoSilvio) => void;
}) {
  const t = useT();
  const { analisi, attesa, errore, versione, salva, aggiorna } = useAnalisiCostiPreventivo({ companyId, tipo: "computo", id: draftId });
  const [cerca, setCerca] = useState("");
  const [soloDaCompletare, setSoloDaCompletare] = useState(false);
  const [dettaglioAperto, setDettaglioAperto] = useState<string | null>(null);
  const [modifica, setModifica] = useState<Modifica | null>(null);
  const [proposte, setProposte] = useState<{ richiesta: RichiestaProposteCosti; versione: number } | null>(null);
  const [salvandoProposte, setSalvandoProposte] = useState(false);
  const prossimaModifica = useRef(0);
  const ultimaRichiesta = useRef<number | null>(null);
  const base = useMemo(() => economiaAnalisiComputo(bozza), [bozza]);
  useEffect(() => {
    if (!richiesta || attesa || ultimaRichiesta.current === richiesta.id) return;
    ultimaRichiesta.current = richiesta.id;
    try {
      if (!puoModificare || versione === undefined) throw new Error(errore ?? "L’analisi costi non è modificabile con questo accesso.");
      const selezioni = richiesta.comandi.map(comando => ({ ...risorsaDaComandoCosto(analisi, base.voci, comando), prezzo: comando.prezzo }));
      const voce = selezioni[0].voce.id;
      if (selezioni.some(selezione => selezione.voce.id !== voce)) throw new Error("Per confrontare più costi insieme, scegli le risorse della stessa voce.");
      if (new Set(selezioni.map(selezione => selezione.risorsa.id)).size !== selezioni.length) throw new Error("Indica un solo nuovo costo per risorsa.");
      if (selezioni.every(({ risorsa, prezzo }) => numeroCosto(risorsa.prezzo) === prezzo)) throw new Error("I costi indicati sono già salvati.");
      const risorse = selezioni.map(({ risorsa, prezzo }) => ({ id: risorsa.id, prezzo: String(prezzo).replace(".", ",") }));
      setModifica({ id: ++prossimaModifica.current, voce, risorse, versione });
      setProposte(null);
      onRiscontro?.(richiesta.id, {});
    } catch (e) { onRiscontro?.(richiesta.id, { errore: e instanceof Error ? e.message : "Richiesta da verificare." }); }
  }, [analisi, attesa, base.voci, errore, onRiscontro, puoModificare, richiesta, versione]);
  const dati = useMemo(() => proposta ? economiaAnalisiComputo(bozza, proposta) : base, [bozza, proposta, base]);
  const calcolo = useMemo(() => analizzaPreventivo(analisi, dati.voci, dati.imponibile), [analisi, dati]);
  const prima = useMemo(() => proposta && !base.errore ? analizzaPreventivo(analisi, base.voci, base.imponibile) : null, [analisi, base, proposta]);
  const quote = useMemo(() => quoteCostiComuni(calcolo), [calcolo]);
  const incluse = calcolo.righe.filter(riga => riga.voce.inclusa);
  const ricavoParziale = Boolean(dati.errore) || incluse.some(riga => riga.voce.vendita === null);
  const margineDisponibile = !ricavoParziale && !calcolo.incompleto && incluse.length > 0;
  const haCosti = calcolo.costo !== 0 || incluse.some(riga => riga.costo !== null && !riga.incompleto);
  const vociStimabili = base.voci.filter(v => v.inclusa && !motivoVoceDaCompletare(analisi, v));
  const cercato = cerca.trim().toLocaleLowerCase("it");
  const righe = calcolo.righe.map((riga, indice) => ({
    ...riga, indice, costoCompleto: costoCompletoVoce(riga, quote.get(riga.voce.id)),
  })).filter(({ voce, indice, costoCompleto }) =>
    (!soloDaCompletare || (voce.inclusa && (costoCompleto === null || voce.vendita === null))) &&
    `${indice + 1} ${voce.codice ?? ""} ${voce.descrizione} ${voce.fase}`.toLocaleLowerCase("it").includes(cercato)
  );
  const voceModificata = modifica && base.voci.find(voce => voce.id === modifica.voce);
  const risorseModificate = modifica?.risorse.flatMap(({ id, prezzo }) => {
    const risorsa = analisi.voci[modifica.voce]?.find(r => r.id === id && r.base !== "percentuale");
    return risorsa ? [{ risorsa, prezzoIniziale: prezzo }] : [];
  });

  if (attesa || errore) return <p role={errore ? "alert" : "status"} className="px-4 py-5 text-sm text-slate-600">{errore || t("Carico l’analisi costi…")}</p>;

  function apriProposte() {
    if (!puoModificare || versione === undefined || proposta || !vociStimabili.length) return;
    setProposte({ versione, richiesta: {
      azione: "storico", voci: vociStimabili, tutte: base.voci, imponibile: base.imponibile, analisi, preferisciListino: true,
      contesto: { companyId, indirizzo: bozza.indirizzo },
      onListino: voce => risorseDaTariffaAnalisi(companyId, { codice: voce.codice?.trim() ?? "", unita: voce.unita }),
    } });
    setModifica(null);
  }

  async function salvaProposte(modifiche: ModificaAnalisiProposta[]) {
    if (!proposte || !puoModificare || salvandoProposte || !modifiche.length) return;
    if (proposta || proposte.versione !== versione || proposte.richiesta.tutte !== base.voci || proposte.richiesta.analisi !== analisi) {
      toast.error(t("Il computo o l’analisi sono cambiati. Ricalcola le proposte sui dati aggiornati."));
      return;
    }
    setSalvandoProposte(true);
    try {
      await salva(applicaModificheAnalisi(analisi, modifiche), proposte.versione);
      setProposte(null);
      toast.success(t("Analisi del computo aggiornata"));
    } catch (e) {
      void aggiorna();
      toast.error(e instanceof Error ? e.message : t("Le proposte non sono state salvate."));
    } finally { setSalvandoProposte(false); }
  }

  if (proposte && puoModificare) return <ProposteCostiMultiple richiesta={proposte.richiesta}
    busy={salvandoProposte} chiudi={() => setProposte(null)} applica={modifiche => void salvaProposte(modifiche)} />;

  const variazioneCosti = prima ? calcolo.costo - prima.costo : 0;
  const notaCosti = [
    calcolo.incompleto && "Costi parziali",
    variazioneCosti !== 0 && differenza(soldi(variazioneCosti)),
  ].filter(Boolean).join(" · ") || `Comuni ${formatCurrency(soldi(calcolo.comuni))}`;
  const indicatori = [
    { titolo: t("Ricavo netto"), valore: dati.errore ? "—" : formatCurrency(dati.imponibile),
      nota: ricavoParziale ? t("Prezzi da completare") : prima && !prima.righe.some(r => r.voce.inclusa && r.voce.vendita === null) ? differenza(dati.imponibile - prima.imponibile) : t("Al netto di IVA e sconti") },
    { titolo: t("Costi stimati"), valore: haCosti ? formatCurrency(soldi(calcolo.costo)) : "—", nota: notaCosti },
    { titolo: t("Margine stimato"), valore: margineDisponibile ? formatCurrency(soldi(calcolo.margine)) : "—",
      nota: margineDisponibile && calcolo.percentuale !== null ? percentuale.format(calcolo.percentuale / 100) : t("Da completare") },
  ];

  return <section aria-label={t("Analisi dei costi del computo")} className="flex min-h-0 flex-1 flex-col overflow-auto overscroll-contain">
    {puoModificare && modifica && voceModificata && risorseModificate?.length === modifica.risorse.length && <ConfrontoModificaCostoSilvio
      key={modifica.id} analisi={analisi} voci={base.voci} imponibile={base.imponibile} erroreSconto={base.errore}
      voce={voceModificata} risorse={risorseModificate} bozzaCommerciale={!!proposta}
      superata={modifica.versione !== versione}
      onAnnulla={() => setModifica(null)}
      onRicalcola={() => { if (versione !== undefined) setModifica({ ...modifica, versione }); }}
      onSalva={async valore => {
        try { await salva(valore, modifica.versione); }
        catch (e) { void aggiorna(); throw e; }
        setModifica(attuale => attuale?.id === modifica.id ? null : attuale);
        toast.success(modifica.risorse.length === 1 ? t("Costo aggiornato nell’analisi del computo") : t("Costi aggiornati nell’analisi del computo"));
      }} />}
    {puoModificare && modifica && (!voceModificata || risorseModificate?.length !== modifica.risorse.length) && <div role="alert" className="flex flex-wrap items-center gap-2 border-b p-3 text-sm">
      {t("Le risorse della proposta sono cambiate. Apri il dettaglio e ripeti la modifica.")}
      <Button type="button" size="sm" variant="outline" onClick={() => setModifica(null)}>{t("Chiudi")}</Button>
    </div>}
    <div className="border-b border-slate-200 px-3 py-3 sm:px-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold text-slate-900">{proposta ? t("Anteprima delle modifiche") : t("Analisi costi")}</h3>
        <span className="text-xs text-slate-600">{t("{n} di {n2} voci con costo completo", { n: incluse.length - calcolo.mancanti, n2: incluse.length })}</span>
      </header>
      <dl className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {indicatori.map(({ titolo, valore, nota }) => <div key={titolo} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2 sm:p-3">
          <dt className="text-xs font-medium text-slate-600">{titolo}</dt>
          <dd className="mt-1 break-words text-[13px] font-semibold tabular-nums text-slate-900 sm:text-base">{valore}</dd>
          <dd className="mt-0.5 text-[11px] leading-tight text-slate-600">{nota}</dd>
        </div>)}
      </dl>
      {dati.errore && <p role="alert" className="mt-2 text-xs text-amber-800">{dati.errore}</p>}
      {proposta && <p className="mt-2 text-xs text-slate-600">{t("I valori si riferiscono alla bozza della chat. Le variazioni sono rispetto al computo salvato.")}</p>}
    </div>
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 sm:px-4">
      <div className="relative min-w-[160px] flex-1">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-500" />
        <Input type="search" className="h-9 pl-8 text-base sm:text-sm" aria-label={t("Cerca nell’analisi costi")}
          placeholder={t("Cerca voce, codice o capitolo")} value={cerca} onChange={e => setCerca(e.currentTarget.value)} />
      </div>
      <Button type="button" size="sm" variant={soloDaCompletare ? "secondary" : "outline"} aria-pressed={soloDaCompletare}
        onClick={() => setSoloDaCompletare(attiva => !attiva)}>{t("Da completare")}</Button>
      {puoModificare && !proposta && !!vociStimabili.length && <Button type="button" size="sm" variant="outline"
        onClick={apriProposte}>{t("Proponi costi e tempi")}</Button>}
    </div>
    {righe.length ? <div className="min-h-24 min-w-0 flex-1 overflow-auto overscroll-contain">
      <table role="table" aria-label={t("Costi delle lavorazioni")} className="quote-computo-costi-table w-full text-left text-xs">
        <thead role="rowgroup" className="sticky top-0 z-[1] bg-slate-100 text-slate-600">
          <tr role="row" className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
            <th scope="col">{t("Lavorazione")}</th><th scope="col" className="text-right">{t("Ricavo netto")}</th>
            <th scope="col" className="text-right">{t("Costo stimato")}</th><th scope="col" className="text-right">{t("Margine")}</th>
          </tr>
        </thead>
        <tbody role="rowgroup" className="divide-y divide-slate-100">
          {righe.map(({ voce, indice, costoCompleto, dettaglio }) => {
            const margine = voce.vendita !== null && costoCompleto !== null && !dati.errore ? voce.vendita - soldi(costoCompleto) : null;
            const quota = quote.get(voce.id);
            const dettaglioVisibile = dettaglioAperto === voce.id;
            return <Fragment key={voce.id}><tr role="row" className="quote-computo-costi-row align-top [&>td]:px-3 [&>td]:py-2">
              <td role="cell"><p className="line-clamp-2 break-words font-medium text-slate-900" title={voce.descrizione}>{voce.descrizione}</p>
                <p className="mt-0.5 text-slate-600">{[voce.codice || `Voce ${indice + 1}`, voce.fase,
                  voce.quantita === null ? "Quantità da definire" : `${numero.format(voce.quantita)} ${voce.unita}`,
                  !voce.inclusa && "Fuori dal totale"].filter(Boolean).join(" · ")}</p>
                {!!dettaglio.righe.length && <button type="button" aria-expanded={dettaglioVisibile}
                  className="mt-1 inline-flex min-h-6 items-center gap-0.5 font-medium text-blue-800 hover:underline"
                  onClick={() => setDettaglioAperto(dettaglioVisibile ? null : voce.id)}>
                  <ChevronDown aria-hidden="true" className={`size-3 ${dettaglioVisibile ? "rotate-180" : ""}`} /> {t("Dettaglio costi")}
                </button>}
              </td>
              <td role="cell" className="whitespace-nowrap text-right tabular-nums"><span aria-hidden="true" className="quote-computo-costi-label">{t("Ricavo netto")}</span>{importo(dati.errore ? null : voce.vendita)}</td>
              <td role="cell" className="whitespace-nowrap text-right tabular-nums"><span aria-hidden="true" className="quote-computo-costi-label">{t("Costo stimato")}</span>{importo(costoCompleto === null ? null : soldi(costoCompleto))}</td>
              <td role="cell" className={`whitespace-nowrap text-right font-medium tabular-nums ${margine !== null && margine < 0 ? "text-red-700" : ""}`}>
                <span aria-hidden="true" className="quote-computo-costi-label">{t("Margine")}</span>{importo(margine)}
              </td>
            </tr>
            {dettaglioVisibile && <tr role="row" className="quote-computo-costi-detail bg-slate-50"><td role="cell" colSpan={4} className="px-3 py-2">
              <ul aria-label={t("Risorse della lavorazione")} className="divide-y divide-slate-200">
                {dettaglio.righe.map(riga => <li key={riga.risorsa.id} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                  <div className="min-w-0">
                    <span className="break-words font-medium">{riga.risorsa.nome || t("Risorsa da definire")}</span>
                    <p className="text-slate-600">{categorieCosto[riga.risorsa.tipo]} · {riga.risorsa.base === "unitaria" ? t("Per unità di lavorazione") : riga.risorsa.base === "percentuale" ? t("Percentuale sui costi diretti") : t("Importo per l’intera voce")}</p>
                    {riga.risorsa.fonte && <p className="text-slate-600">{riga.risorsa.fonte}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums">{importo(riga.importo === null ? null : soldi(riga.importo))}</span>
                    {puoModificare && versione !== undefined && riga.risorsa.base !== "percentuale" && base.voci.some(r => r.id === voce.id) &&
                      <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-blue-800"
                        aria-label={t("Modifica costo di {nome}", { nome: String(riga.risorsa.nome ?? "") })}
                        onClick={() => setModifica({ id: ++prossimaModifica.current, voce: voce.id, risorse: [{ id: riga.risorsa.id, prezzo: riga.risorsa.prezzo }], versione })}>
                        <Pencil aria-hidden="true" className="size-3" /> {t("Modifica costo")}
                      </Button>}
                  </div>
                </li>)}
                {quota && (quota.fase + quota.preventivo !== 0 || quota.parziale) && <li className="flex items-baseline justify-between gap-2 py-1.5 text-slate-700">
                  <span>{t("Quota costi comuni")}{quota.parziale && ` ${t("· parziale")}`}</span>
                  <span className="shrink-0 tabular-nums">{formatCurrency(soldi(quota.fase + quota.preventivo))}</span>
                </li>}
              </ul>
            </td></tr>}
            </Fragment>;
          })}
        </tbody>
      </table>
    </div> : <p role="status" className="p-4 text-sm text-slate-600">{dati.voci.length ? t("Nessuna voce corrisponde ai filtri.") : t("Aggiungi una lavorazione per vedere i costi.")}</p>}
  </section>;
}
