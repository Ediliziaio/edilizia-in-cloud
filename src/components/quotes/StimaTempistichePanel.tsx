import { useId, useRef, type ReactNode, type Ref } from "react";
import { ArrowDown, CalendarClock, Check, ChevronDown, History, Save, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PianoTempi, StimaTempiSalvata, VoceAnalisi } from "@/lib/preventivi/analisiCosti";
import type { RiferimentoStorico } from "@/lib/preventivi/stimaCostiStorici";
import {
  conDitta, conOperai, formatoDataStima, type riferimentiTempi, stessaPrevisione, stimaTempiAggiornata, type stimaTempistiche, tempisticheDaSalvare,
} from "@/lib/preventivi/stimaTempistiche";

const etichetta = "text-xs font-medium text-slate-700";
const numero = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 });
const giorni = (n: number) => n === 1 ? "1 giorno" : `${n} giorni`;
const giorniStorici = (n: number) => Math.ceil(n - 1e-9);
const descriviPeriodo = (inizio: string, fine: string) =>
  inizio === fine ? formatoDataStima(inizio) : `${formatoDataStima(inizio)} – ${formatoDataStima(fine)}`;
const dataBreve = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
const breve = (data: string) => dataBreve.format(new Date(`${data}T00:00:00Z`));
const giornoUTC = (data: string) => Date.parse(`${data}T00:00:00Z`) / 86_400_000;
const ordineLavori = [
  { valore: "sequenza", testo: "Dopo la squadra" },
  { valore: "ditta_prima", testo: "Prima della squadra" },
  { valore: "parallelo", testo: "In parallelo" },
] as const;

type Props = {
  voce: VoceAnalisi;
  piano: PianoTempi;
  cambia: (patch: Partial<PianoTempi>) => void;
  campione: readonly RiferimentoStorico[];
  storico: ReturnType<typeof riferimentiTempi>;
  tempi: ReturnType<typeof stimaTempistiche>;
  minutiPercorso?: string;
  oreDaRisorse?: string;
  salvata?: StimaTempiSalvata;
  busy: boolean;
  controlloEsecuzione: ReactNode;
  statoStorico: ReactNode;
  criteriStorico: ReactNode;
  costiInBozza: boolean;
  onSalva?: (stima: StimaTempiSalvata) => void;
  onRipristina?: () => void;
};

function CampoTempi({ label, value, onChange, placeholder, storico, azione, campo }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; campo?: keyof PianoTempi;
  storico?: number; azione?: { label: string; esegui: () => void };
}) {
  const id = useId();
  return <div className="grid min-w-0 content-start gap-1">
    <label htmlFor={id} className={etichetta}>{label}</label>
    <div className="relative min-w-0">
      <Input id={id} className={`h-9 min-w-0 text-sm ${storico ? "placeholder:text-blue-800" : ""}`}
        data-campo-stima={campo}
        value={value} inputMode="decimal" maxLength={32} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        aria-describedby={storico || azione ? `${id}-aiuto` : undefined} />
    </div>
    {(!!storico || azione) && <div id={`${id}-aiuto`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {!!storico && <span className="text-slate-600">Da {storico} {storico === 1 ? "commessa" : "commesse"}</span>}
      {azione && <button type="button" onClick={azione.esegui} className="rounded text-left font-medium text-blue-800 hover:underline disabled:opacity-50">
        {azione.label}
      </button>}
    </div>}
  </div>;
}

type Previsione = NonNullable<ReturnType<typeof stimaTempistiche>["previsione"]>;
function CalendarioPrevisto({ partenza, previsione, id, calendarioRef }: {
  partenza: string; previsione: Previsione; id: string; calendarioRef: Ref<HTMLDivElement>;
}) {
  const span = giornoUTC(previsione.fine) - giornoUTC(partenza) + 1;
  const percentuale = (data: string) => (giornoUTC(data) - giornoUTC(partenza)) / span * 100;
  const righe = [
    { nome: "Materiali disponibili", inizio: previsione.materialiPronti, fine: previsione.materialiPronti, punto: true, colore: "bg-emerald-600" },
    ...(previsione.squadra ? [{ nome: "Squadra interna", ...previsione.squadra, punto: false, colore: "bg-blue-600" }] : []),
    ...(previsione.impresa ? [{ nome: "Subappalto", ...previsione.impresa, punto: false, colore: "bg-violet-600" }] : []),
  ];
  const ultimoLavoro = [previsione.materialiPronti, previsione.squadra?.fine ?? "", previsione.impresa?.fine ?? ""].sort().at(-1);
  return <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5" id={id} ref={calendarioRef}
    aria-label="Calendario previsto" tabIndex={-1} role="group">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <h4 className="text-sm font-semibold text-slate-900">Calendario previsto</h4>
      <span className="text-xs tabular-nums text-slate-600">{breve(partenza)} – {breve(previsione.fine)}</span>
    </div>
    <dl className="space-y-1.5">
      {righe.map(r => <div key={r.nome} className="grid grid-cols-[minmax(0,1fr)_minmax(3.75rem,0.7fr)] items-center gap-x-2 gap-y-1 min-[420px]:grid-cols-[8rem_minmax(0,1fr)_9.5rem]">
        <dt className="text-xs font-medium text-slate-700">{r.nome}</dt>
        <dd className="order-3 col-span-2 text-xs tabular-nums text-slate-600 min-[420px]:col-span-1 min-[420px]:text-right">
          {r.inizio === r.fine ? breve(r.inizio) : `${breve(r.inizio)} – ${breve(r.fine)}`}
        </dd>
        <dd aria-hidden="true" className="relative order-2 h-2.5 min-w-0 rounded-full bg-slate-100">
          {r.punto ? <span className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${r.colore}`}
            style={{ left: `${percentuale(r.inizio) + 50 / span}%` }} />
            : <span className={`absolute inset-y-0 rounded-full ${r.colore}`}
              style={{ left: `${percentuale(r.inizio)}%`, width: `${percentuale(r.fine) - percentuale(r.inizio) + 100 / span}%` }} />}
        </dd>
      </div>)}
    </dl>
    {ultimoLavoro && ultimoLavoro < previsione.fine && <p className="mt-2 border-t pt-1.5 text-xs text-slate-600">
      Ultimo lavoro il {breve(ultimoLavoro)} · riserva fino al {breve(previsione.fine)}
    </p>}
  </div>;
}

export default function StimaTempistichePanel({
  voce, piano, cambia, campione, storico, tempi, minutiPercorso, oreDaRisorse, salvata, busy, controlloEsecuzione, statoStorico, criteriStorico,
  costiInBozza, onSalva, onRipristina,
}: Props) {
  const previsione = tempi.previsione;
  const fornitura = piano.esecuzione === "fornitura";
  const persone = conOperai(piano.esecuzione);
  const ditta = conDitta(piano.esecuzione);
  const q = voce.quantita;
  const parametriModificati = salvata && (Object.keys(piano) as Array<keyof PianoTempi>).some(k => piano[k] !== salvata.piano[k]);
  const analisiDaRicalcolare = !!salvata && !stimaTempiAggiornata(salvata, voce);
  const invariata = stessaPrevisione(salvata, voce, piano, previsione);
  const nomeOrdine = useId();
  const idCalendario = useId();
  const calendarioRef = useRef<HTMLDivElement>(null);
  function vaiAlCalendario() {
    calendarioRef.current?.scrollIntoView({ block: "nearest" });
    calendarioRef.current?.focus({ preventScroll: true });
  }
  const modifica = (campo: keyof Pick<PianoTempi, "partenza" | "attesaMateriali" | "attesaDitta" | "operai" |
    "oreGiorno" | "oreInterne" | "durataDitta" | "minutiViaggio" | "riserva">) => (value: string) => cambia({ [campo]: value });
  function salva() {
    if (!onSalva || !previsione) return;
    const stima = tempisticheDaSalvare(voce, piano, previsione);
    if (stima) onSalva(stima);
  }

  return <section aria-label="Previsione delle tempistiche" className="flex min-h-0 flex-1 flex-col">
    <div className="shrink-0 bg-white px-3 py-2.5 sm:px-4" aria-label="Riepilogo tempistiche" role="region">
      {previsione ? <div className="rounded-xl bg-[#193653] px-3 py-2.5 text-white">
        <dl className={`grid gap-x-2 gap-y-1 ${fornitura ? "grid-cols-1" : "grid-cols-3"}`}>
          {!fornitura && <div className="min-w-0"><dt className="text-xs text-blue-100">Inizio previsto</dt>
            <dd className="mt-0.5 text-sm font-semibold leading-tight tabular-nums sm:text-base">{formatoDataStima(previsione.inizio)}</dd></div>}
          <div className="min-w-0"><dt className="text-xs text-blue-100">{fornitura ? "Consegna prevista" : "Fine prevista"}</dt>
            <dd className="mt-0.5 text-sm font-semibold leading-tight tabular-nums sm:text-base">{formatoDataStima(previsione.fine)}</dd></div>
          {!fornitura && <div className="min-w-0"><dt className="text-xs text-blue-100">Giorni operativi</dt>
            <dd className="mt-0.5 text-sm font-semibold leading-tight tabular-nums sm:text-base">{giorni(previsione.giorni)}</dd></div>}
        </dl>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-white/20 pt-1.5">
          {previsione.fineMin !== previsione.fineMax && <dl className="flex flex-wrap items-baseline gap-x-2">
            <dt className="text-xs text-blue-100">Finestra stimata</dt>
            <dd className="text-xs font-medium tabular-nums">{descriviPeriodo(previsione.fineMin, previsione.fineMax)}</dd>
          </dl>}
          <button type="button" aria-controls={idCalendario} onClick={vaiAlCalendario}
            className="ml-auto inline-flex min-h-6 items-center gap-1 rounded text-xs font-medium text-blue-100 hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-white">
            Vedi calendario <ArrowDown className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div> : <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-950">
        <CalendarClock className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
        <div><p className="text-sm font-semibold">Previsione da completare</p>
          <p className="mt-0.5 text-xs">{tempi.mancanti.join(" · ")}</p></div>
      </div>}
    </div>

    <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain bg-slate-50/80 px-3 pb-3 pt-2.5 sm:px-4">
      <fieldset disabled={busy} className="min-w-0 space-y-2.5">
        <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3">
          <h4 className="text-sm font-semibold">Avvio e disponibilità</h4>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            <label className={`grid min-w-0 content-start gap-1 ${etichetta}`}>Data di partenza
              <Input className="h-9 min-w-0 px-2 text-sm" data-campo-stima="partenza" type="date"
                value={piano.partenza} onChange={e => modifica("partenza")(e.target.value)} />
            </label>
            {controlloEsecuzione}
            <CampoTempi label="Attesa materiali (giorni solari)" campo="attesaMateriali" value={piano.attesaMateriali} onChange={modifica("attesaMateriali")}
              placeholder={storico.materiali ? String(giorniStorici(storico.materiali.tipico)) : "Giorni previsti"}
              storico={!piano.attesaMateriali.trim() ? storico.materiali?.fonti.length : undefined}
              azione={piano.attesaMateriali.trim() !== "0" ? { label: "Materiali già disponibili", esegui: () => cambia({ attesaMateriali: "0" }) } : undefined} />
            {ditta && <CampoTempi label="Disponibilità ditta (giorni solari)" campo="attesaDitta" value={piano.attesaDitta} onChange={modifica("attesaDitta")}
              placeholder="Giorni di attesa"
              azione={piano.attesaDitta.trim() !== "0" ? { label: "Ditta già disponibile", esegui: () => cambia({ attesaDitta: "0" }) } : undefined} />}
          </div>
          {statoStorico}
        </div>

        {(persone || ditta) && <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <h4 className="text-sm font-semibold">Organizzazione del lavoro</h4>
            {persone && tempi.oreProduttive !== null && tempi.oreProduttive > 0 && tempi.giorniInterni !== null &&
              <span className="text-xs text-slate-600">{numero(tempi.oreProduttive)} h produttive a turno · {giorni(tempi.giorniInterni)} di squadra</span>}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            {persone && <>
              <CampoTempi label="Operai in squadra" campo="operai" value={piano.operai} onChange={modifica("operai")} />
              <CampoTempi label="Ore di turno per persona" campo="oreGiorno" value={piano.oreGiorno} onChange={modifica("oreGiorno")} />
              <CampoTempi label="Ore-uomo della lavorazione" campo="oreInterne" value={piano.oreInterne} onChange={modifica("oreInterne")}
                placeholder={storico.ore ? numero(storico.ore.tipico) : "Ore previste"} storico={!piano.oreInterne.trim() ? storico.ore?.fonti.length : undefined}
                azione={oreDaRisorse && oreDaRisorse !== piano.oreInterne ? { label: `Usa ${numero(Number(oreDaRisorse))} h dalle risorse`,
                  esegui: () => cambia({ oreInterne: oreDaRisorse }) } : undefined} />
            </>}
            {ditta && <CampoTempi label="Subappalto (giorni lavorativi)" campo="durataDitta" value={piano.durataDitta} onChange={modifica("durataDitta")}
              placeholder={storico.ditta ? String(giorniStorici(storico.ditta.tipico)) : "Durata concordata"}
              storico={!piano.durataDitta.trim() ? storico.ditta?.fonti.length : undefined} />}
          </div>
          {persone && ditta && <fieldset className="min-w-0">
            <legend className={`mb-1 ${etichetta}`}>Quando lavora la ditta?</legend>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
              {ordineLavori.map(opzione => <label key={opzione.valore}
                className="relative flex min-h-9 cursor-pointer items-center justify-center rounded-md border border-transparent px-1 py-1.5 text-center text-xs leading-tight text-slate-700 has-[:checked]:border-blue-200 has-[:checked]:bg-white has-[:checked]:font-semibold has-[:checked]:text-blue-900 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-600 has-[:disabled]:cursor-default">
                <input className="sr-only" type="radio" name={nomeOrdine} checked={piano.coordinamento === opzione.valore}
                  onChange={() => cambia({ coordinamento: opzione.valore })} />
                {opzione.testo}
              </label>)}
            </div>
          </fieldset>}
        </div>}

        <details className="group rounded-xl border border-slate-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-sm font-semibold">Viaggi, calendario e riserva</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-t px-3 pb-3 pt-2.5">
            {persone && <CampoTempi label="Minuti di andata nel turno" campo="minutiViaggio" value={piano.minutiViaggio} onChange={modifica("minutiViaggio")}
              placeholder="0 se fuori turno" azione={minutiPercorso ? { label: `Usa ${minutiPercorso} min per tratta`,
                esegui: () => cambia({ minutiViaggio: minutiPercorso }) } : undefined} />}
            <CampoTempi label="Riserva (giorni lavorativi)" campo="riserva" value={piano.riserva} onChange={modifica("riserva")} placeholder="0" />
            <label className="col-span-2 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={piano.sabato} onChange={e => cambia({ sabato: e.target.checked })} /> Includi il sabato
            </label>
            <p className="col-span-2 text-xs text-slate-600">Calendario di cantiere con le chiusure configurate.</p>
          </div>
        </details>

        <details className="group rounded-xl border border-slate-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
            <History className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-sm font-semibold">Fonti della previsione</span>
            {!!campione.length && <span className="text-xs text-slate-600">{campione.length} {campione.length === 1 ? "commessa" : "commesse"}</span>}
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-2 border-t px-3 pb-3 pt-2.5">
            {criteriStorico}
            <p className="text-xs text-slate-600">{campione.length
              ? "I campi vuoti usano le ore registrate, i rapportini approvati e le consegne degli ordini d’acquisto disponibili per le commesse simili."
              : "Inserisci manualmente le durate e le attese per calcolare le date di questa lavorazione."}</p>
          </div>
        </details>
      </fieldset>

      {previsione && <CalendarioPrevisto id={idCalendario} partenza={piano.partenza} previsione={previsione} calendarioRef={calendarioRef} />}
      {(analisiDaRicalcolare || (!!salvata && !invariata)) && salvata && <p className="text-xs text-slate-600">
        {analisiDaRicalcolare ? "Voce aggiornata. " : ""}
        Ultima stima salvata · {descriviPeriodo(salvata.inizio, salvata.fine)}.
      </p>}
    </div>

    {onSalva && <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-white px-3 py-2 sm:px-4" role="group" aria-label="Salvataggio tempistiche">
      <div className="min-w-0 grow text-xs text-slate-600" role="status">
        {invariata ? <span className="flex items-center gap-1 font-medium text-emerald-800">
          <Check className="h-3.5 w-3.5" aria-hidden="true" /> Tempistiche salvate
        </span> : q === null || q <= 0 ? "Completa la quantità" : salvata ? "Modifiche da salvare" : "Da salvare nella lavorazione"}
        {costiInBozza && <span className="block">Costi in bozza</span>}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {parametriModificati && onRipristina && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onRipristina}>Ripristina</Button>}
        <Button type="button" size="sm" disabled={busy || invariata || !previsione || q === null || q <= 0} onClick={salva}>
          <Save aria-hidden="true" />Salva tempistiche
        </Button>
      </div>
    </div>}
  </section>;
}
