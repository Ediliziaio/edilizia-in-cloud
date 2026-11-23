import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarDays, Check, Copy, FileSearch, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useCalendarioCantiere } from "@/hooks/useCalendarioCantiere";
import { letturaRiferimentiCosti } from "@/hooks/useRiferimentiCostiPreventivo";
import { calendarioCantiere } from "@/lib/orders/sottofasi";
import { dettaglioRisorse, type AnalisiCosti, type RisorsaCosto, type VoceAnalisi } from "@/lib/preventivi/analisiCosti";
import {
  confrontaAnalisiProposta, proponiTempisticheLavorazione,
  type ModificaAnalisiProposta, type ParametriDateProposta,
} from "@/lib/preventivi/anteprimaAnalisiCosti";
import {
  copiaComposizioneCosti, motivoVoceDaCompletare, proponiCostiDaiConsuntivi, risorseReplicabili, type PropostaAnalisiCosti,
} from "@/lib/preventivi/proposteAnalisiCosti";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import type { RiferimentoStorico } from "@/lib/preventivi/stimaCostiStorici";
import { stimaTempiAggiornata } from "@/lib/preventivi/stimaTempistiche";
import type { ContestoStima } from "./StimaCostiPanel";
import ConfrontoAnalisiProposta, { RiepilogoConfrontoProposta } from "./ConfrontoAnalisiProposta";

export type RichiestaProposteCosti = {
  azione: "storico" | "copia";
  fase?: string;
  voci: VoceAnalisi[];
  tutte: VoceAnalisi[];
  imponibile: number;
  analisi: AnalisiCosti;
  contesto?: ContestoStima;
  onListino?: (voce: VoceAnalisi) => Promise<RisorsaCosto[]>;
  preferisciListino?: boolean;
};

async function leggiInGruppi<T>(voci: VoceAnalisi[], leggi: (voce: VoceAnalisi) => Promise<T>, interrotta: () => boolean, progresso?: (n: number) => void) {
  const risultati: T[] = [];
  for (let i = 0; i < voci.length && !interrotta(); i += 4) {
    const gruppo = await Promise.all(voci.slice(i, i + 4).map(leggi));
    risultati.push(...gruppo);
    if (!interrotta()) progresso?.(risultati.length);
  }
  return risultati;
}

type ConsuntiviDate = { righe: RiferimentoStorico[]; errore?: boolean };
const etichetta = "grid min-w-0 content-start gap-1 text-xs font-medium text-slate-700";

export default function ProposteCostiMultiple({ richiesta, busy, chiudi, applica }: {
  richiesta: RichiestaProposteCosti;
  busy: boolean;
  chiudi: () => void;
  applica: (righe: ModificaAnalisiProposta[]) => void;
}) {
  const t = useT();
  const client = useQueryClient();
  const { azione, fase, analisi, voci, tutte, imponibile, contesto, onListino, preferisciListino } = richiesta;
  const titolo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titolo.current?.focus(); }, []);
  const fontiCopia = useMemo(() => azione === "copia" ? tutte
    .map(voce => ({ voce, risorse: risorseReplicabili(analisi, voce) }))
    .filter(r => r.risorse.some(c => c.base === "unitaria") && !dettaglioRisorse(r.risorse, r.voce.quantita).incompleto) : [], [analisi, azione, tutte]);
  const [origine, scegliOrigine] = useState(fontiCopia.length === 1 ? fontiCopia[0].voce.id : "");
  const [storico, setStorico] = useState<PropostaAnalisiCosti[]>([]);
  const [analizzate, contaAnalizzate] = useState(0);
  const [pianifica, impostaPianifica] = useState(false);
  const [escluse, impostaEscluse] = useState(() => new Set<string>());
  const [parametri, setParametri] = useState<ParametriDateProposta>(() => ({
    partenza: format(new Date(), "yyyy-MM-dd"), operai: "2", oreGiorno: "8", attesaMateriali: "", attesaDitta: "", sabato: false,
  }));
  const [consuntiviDate, setConsuntiviDate] = useState<Map<string, ConsuntiviDate> | null>(null);
  const { chiusure } = useCalendarioCantiere(Number(parametri.partenza.slice(0, 4)) || undefined);
  const lavorativo = useMemo(() => calendarioCantiere({ sabato: parametri.sabato, chiusure }), [parametri.sabato, chiusure]);
  const fonti = fontiCopia.find(r => r.voce.id === origine);

  useEffect(() => {
    if (azione !== "storico" || !contesto) return;
    const { companyId, preventivoId, tipoLavoro } = contesto;
    let annullata = false;
    async function proponiDaListino(voce: VoceAnalisi): Promise<PropostaAnalisiCosti | null> {
      if (!onListino || !(voce.codice?.trim() || voce.tariffaId)) return null;
      try {
        const risorse = await onListino(voce);
        const costo = dettaglioRisorse(risorse, voce.quantita);
        if (costo.incompleto || !risorse.length) return null;
        return { voce, risorse, fonti: [...new Set(risorse.map(r => r.fonte).filter(Boolean))], esito: "Dal listino aziendale" };
      } catch { return null; }
    }
    async function proponi(voce: VoceAnalisi): Promise<PropostaAnalisiCosti> {
      const motivo = motivoVoceDaCompletare(analisi, voce);
      if (motivo) return { voce, risorse: [], fonti: [], esito: motivo };
      if (preferisciListino) {
        const listino = await proponiDaListino(voce);
        if (listino) return listino;
      }
      let proposta: PropostaAnalisiCosti;
      try {
        const dati = await client.fetchQuery(letturaRiferimentiCosti(companyId, voce, preventivoId));
        proposta = proponiCostiDaiConsuntivi(voce, dati, tipoLavoro);
      } catch {
        return { voce, risorse: [], fonti: [], esito: "Storico non disponibile · riprova" };
      }
      if (annullata || preferisciListino || proposta.risorse.length || !onListino || !(voce.codice?.trim() || voce.tariffaId)) return proposta;
      return await proponiDaListino(voce) ?? { ...proposta, esito: "Consuntivi insufficienti · tariffa non disponibile" };
    }
    void leggiInGruppi(voci, proponi, () => annullata, contaAnalizzate).then(risultati => {
      if (!annullata) setStorico(risultati);
    });
    return () => { annullata = true; };
  }, [azione, analisi, voci, contesto, client, onListino, preferisciListino]);

  const attesaCosti = azione === "storico" && storico.length !== voci.length;
  const attesaDate = pianifica && !!contesto && consuntiviDate === null;
  useEffect(() => {
    if (!pianifica || !contesto || attesaCosti || consuntiviDate !== null) return;
    const { companyId, preventivoId } = contesto;
    let annullata = false;
    const candidati = voci.filter(voce => {
      const salvata = analisi.tempistiche?.[voce.id];
      return voce.inclusa && !!voce.quantita && voce.quantita > 0 && voce.descrizione.trim() &&
        (!salvata || !stimaTempiAggiornata(salvata, voce));
    });
    void leggiInGruppi(candidati, async (voce): Promise<[string, ConsuntiviDate]> => {
      try {
        const righe = await client.fetchQuery(letturaRiferimentiCosti(companyId, voce, preventivoId));
        return [voce.id, { righe }];
      } catch {
        return [voce.id, { righe: [], errore: true }];
      }
    }, () => annullata).then(risultati => {
      if (!annullata) setConsuntiviDate(new Map(risultati));
    });
    return () => { annullata = true; };
  }, [pianifica, contesto, attesaCosti, consuntiviDate, voci, analisi.tempistiche, client]);

  const attesa = attesaCosti || attesaDate;
  const proposte = useMemo(() => azione === "storico" ? storico : fonti ? voci.map(voce => {
    const esito = motivoVoceDaCompletare(analisi, voce);
    return esito ? { voce, risorse: [], fonti: [], esito } : copiaComposizioneCosti(fonti.voce, voce, fonti.risorse);
  }) : [], [azione, storico, fonti, voci, analisi]);
  const costi = useMemo(() => new Map(proposte.map(p => [p.voce.id, p])), [proposte]);
  const date = useMemo(() => {
    const proposteDate = new Map<string, ReturnType<typeof proponiTempisticheLavorazione>>();
    if (!pianifica || attesa) return proposteDate;
    for (const voce of voci) {
      const salvata = analisi.tempistiche?.[voce.id];
      if (!voce.inclusa || salvata && stimaTempiAggiornata(salvata, voce)) continue;
      const proposte = costi.get(voce.id)?.risorse;
      const risorse = proposte?.length ? proposte : analisi.voci[voce.id] ?? [];
      const riferimenti = consuntiviDate?.get(voce.id);
      const esito = proponiTempisticheLavorazione(voce, risorse, riferimenti?.righe ?? [], parametri, lavorativo, contesto?.tipoLavoro);
      if (riferimenti?.errore && !esito.stima) esito.problemi.push(t("Consuntivi non disponibili"));
      proposteDate.set(voce.id, esito);
    }
    return proposteDate;
  }, [pianifica, attesa, voci, analisi, costi, consuntiviDate, parametri, lavorativo, contesto?.tipoLavoro, t]);
  const modifiche = useMemo(() => voci.flatMap(voce => {
    const risorse = costi.get(voce.id)?.risorse;
    const tempistiche = date.get(voce.id)?.stima;
    return risorse?.length || tempistiche ? [{ voce, risorse, tempistiche }] : [];
  }), [voci, costi, date]);
  const modificabili = useMemo(() => new Set(modifiche.map(m => m.voce.id)), [modifiche]);
  const selezionate = useMemo(() => modifiche.filter(m => !escluse.has(m.voce.id)), [modifiche, escluse]);
  const confronto = useMemo(() => confrontaAnalisiProposta(analisi, tutte, voci, imponibile, selezionate), [analisi, tutte, voci, imponibile, selezionate]);
  const nCosti = selezionate.filter(m => m.risorse?.length).length;
  const nDate = selezionate.filter(m => m.tempistiche).length;
  const conteggio = [nCosti > 0 ? t(nCosti === 1 ? "{n} costo" : "{n} costi", { n: nCosti }) : null,
    nDate > 0 ? t(nDate === 1 ? "{n} data" : "{n} date", { n: nDate }) : null].filter(Boolean).join(" · ");
  const azioneSalva = nCosti && nDate ? t("Salva costi e date") : nDate ? t("Salva date") : t("Salva costi");
  const modificaParametro = (campo: "partenza" | "operai" | "oreGiorno" | "attesaMateriali" | "attesaDitta") => (valore: string) =>
    setParametri(p => ({ ...p, [campo]: valore }));
  function selezionaProposta(id: string, attiva: boolean) {
    impostaEscluse(prima => {
      const nuove = new Set(prima);
      if (attiva) nuove.delete(id);
      else nuove.add(id);
      return nuove;
    });
  }

  return <section aria-label={t("Anteprima costi per più voci")}
    className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
    <header className="flex shrink-0 items-start justify-between gap-2 border-b bg-slate-50 px-3 py-3 sm:px-5">
      <div>
        <h3 ref={titolo} tabIndex={-1} className="flex items-center gap-2 text-base font-semibold">
          {azione === "storico" ? <FileSearch className="h-4 w-4 text-blue-700" aria-hidden="true" /> : <Copy className="h-4 w-4 text-blue-700" aria-hidden="true" />}
          {fase ? t("Anteprima · {fase}", { fase }) : t("Anteprima di costi e date")}
        </h3>
        <p className="mt-0.5 text-xs text-slate-600">
          {voci.length === 1 ? t("1 voce selezionata") : t("{n} voci selezionate", { n: voci.length })} · {azione === "storico" ? t("Dai consuntivi e dal listino") : t("Copia composizione costi")}
        </p>
      </div>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={t("Chiudi anteprima costi")} disabled={busy} onClick={chiudi}>
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
    </header>
    <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-slate-50/50 px-3 py-3 sm:px-5">
      <RiepilogoConfrontoProposta confronto={confronto} />
      {azione === "copia" && (fontiCopia.length ? <label className="grid gap-1 text-xs font-medium text-slate-700">
        {t("Copia da")}
        <select className="h-9 w-full rounded-md border bg-white px-2 text-sm" value={origine} disabled={busy} onChange={e => scegliOrigine(e.target.value)}>
          <option value="">{t("Scegli una voce con costi unitari")}</option>
          {fontiCopia.map(({ voce }) => <option key={voce.id} value={voce.id}>{[voce.codice, voce.descrizione].filter(Boolean).join(" · ")}</option>)}
        </select>
      </label> : <p className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">{t("Aggiungi costi per unità a una lavorazione per riusarne la composizione.")}</p>)}
      <p className="text-xs text-slate-600">
        {azione === "copia" ? t("Le quantità si adeguano alla voce di destinazione. Gli importi a corpo e le trasferte restano nella loro voce o fase.")
          : t("Usa i consuntivi confrontabili o la tariffa aziendale associata. Trasferte e costi comuni si gestiscono a parte.")}
      </p>
      {voci.some(v => v.inclusa) && <div className="space-y-2.5 rounded-xl border bg-white p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox checked={pianifica} disabled={busy} onCheckedChange={attiva => impostaPianifica(attiva === true)} />
          <CalendarDays className="h-4 w-4 text-blue-700" aria-hidden="true" />{t("Proponi anche le date")}
        </label>
        {pianifica && <div className="space-y-2.5 border-t pt-2.5">
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
            <label className={etichetta}>{t("Data di riferimento")}
              <Input type="date" className="h-9 min-w-0" value={parametri.partenza} disabled={busy} onChange={e => modificaParametro("partenza")(e.target.value)} />
            </label>
            <label className={etichetta}>{t("Operai in squadra")}
              <Input className="h-9" inputMode="numeric" maxLength={32} disabled={busy} value={parametri.operai} onChange={e => modificaParametro("operai")(e.target.value)} />
            </label>
            <label className={etichetta}>{t("Ore di turno per persona")}
              <Input className="h-9" inputMode="decimal" maxLength={32} disabled={busy} value={parametri.oreGiorno} onChange={e => modificaParametro("oreGiorno")(e.target.value)} />
            </label>
            <label className={etichetta}>{t("Attesa materiali (giorni solari)")}
              <Input className="h-9" inputMode="numeric" maxLength={32} disabled={busy} value={parametri.attesaMateriali}
                onChange={e => modificaParametro("attesaMateriali")(e.target.value)} placeholder={t("Dai consuntivi")} />
            </label>
            <label className={etichetta}>{t("Attesa ditta (giorni solari)")}
              <Input className="h-9" inputMode="numeric" maxLength={32} disabled={busy} value={parametri.attesaDitta} onChange={e => modificaParametro("attesaDitta")(e.target.value)}
                placeholder={t("0 se disponibile")} />
            </label>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <Checkbox checked={parametri.attesaMateriali === "0"} disabled={busy} onCheckedChange={attiva => setParametri(p => ({ ...p, attesaMateriali: attiva === true ? "0" : "" }))} />
              {t("Materiali già disponibili")}
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <Checkbox checked={parametri.sabato} disabled={busy} onCheckedChange={attivo => setParametri(p => ({ ...p, sabato: attivo === true }))} />
              {t("Includi il sabato")}
            </label>
          </div>
          <p className="text-xs text-slate-600">{t("Data di riferimento comune. Ogni voce usa le proprie attese e il calendario aziendale.")}</p>
        </div>}
      </div>}
      {attesaCosti && <p role="status" className="rounded-lg bg-blue-50 p-2.5 text-sm text-blue-950">{t("Analizzate {n} di {totale} voci…", { n: analizzate, totale: voci.length })}</p>}
      {!attesaCosti && attesaDate && <p role="status" className="rounded-lg bg-blue-50 p-2.5 text-sm text-blue-950">{t("Cerco i consuntivi per le date…")}</p>}
      <ConfrontoAnalisiProposta confronto={confronto} costi={costi} date={date} modificabili={modificabili}
        escluse={escluse} onSelezione={selezionaProposta} busy={busy || attesa} />
    </div>
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-white px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
      <div className="text-xs">
        <p role="status" className="font-medium text-slate-800">
          {!attesa && (conteggio ? t("{conteggio} da salvare", { conteggio }) : t("Nessuna proposta selezionata"))}
        </p>
        <p className="text-slate-600">{t("Le variazioni del prezzo si confermano in «Simula prezzo».")}</p>
      </div>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={chiudi}>{attesa ? t("Annulla ricerca") : t("Annulla")}</Button>
        <Button type="button" size="sm" disabled={busy || attesa || !selezionate.length} onClick={() => applica(selezionate)}>
          <Check className="h-4 w-4" aria-hidden="true" />{busy ? t("Salvo…") : `${azioneSalva}${selezionate.length ? ` · ${selezionate.length}` : ""}`}
        </Button>
      </div>
    </footer>
  </section>;
}
