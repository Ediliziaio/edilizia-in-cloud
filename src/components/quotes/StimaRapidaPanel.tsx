import type { ReactNode } from "react";
import { ArrowRight, CalendarDays, Check, History, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { euroAnalisi, soldi, type PianoTempi } from "@/lib/preventivi/analisiCosti";
import { modalitaEsecuzione, type ModalitaEsecuzione, type stimaLavorazione } from "@/lib/preventivi/stimaCostiStorici";
import { conOperai, formatoDataStima, type stimaTempistiche } from "@/lib/preventivi/stimaTempistiche";

export type ValutazioneStima = { costo: number; margine: number | null; venditaSuggerita: number | null; obiettivo: string };
export type ScenarioStima = { modo: ModalitaEsecuzione; fonti: number; costo: number | null; margine: number | null; giorni: number | null };
const euro = (costo: number | null) => costo === null ? "—" : euroAnalisi.format(soldi(costo));
const dateFine = (data: string | undefined) => data ? formatoDataStima(data) : "Da completare";

export default function StimaRapidaPanel({
  piano, impostaPartenza, esecuzione, statoStorico, stima, fonti, proiezione, daiCostiInseriti, tempi, problemiCosto, busy,
  modifica, rivediRisorse, rivediStima, salvaTempi, tempiSalvati, mostraScenari, confronta, scenari,
}: {
  piano: PianoTempi;
  impostaPartenza: (data: string) => void;
  esecuzione: ReactNode;
  statoStorico: ReactNode;
  stima: ReturnType<typeof stimaLavorazione>;
  fonti: number;
  proiezione: ValutazioneStima | null;
  daiCostiInseriti: boolean;
  tempi: ReturnType<typeof stimaTempistiche>;
  problemiCosto: { campo: string; testo: string }[];
  busy: boolean;
  modifica: (scheda: "costi" | "tempi", campo?: string) => void;
  rivediRisorse: () => void;
  rivediStima?: () => void;
  salvaTempi?: () => void;
  tempiSalvati: boolean;
  mostraScenari: boolean;
  confronta?: () => void;
  scenari: ScenarioStima[];
}) {
  const { previsione } = tempi;
  const primoCampo = tempi.problemi[0]?.campo;
  const misure = [
    { nome: daiCostiInseriti ? "Costo dalle risorse" : proiezione ? "Costo proposto" : "Costo diretto dallo storico",
      valore: euro(proiezione?.costo ?? stima?.costo ?? null), nota: proiezione ? "Quote comuni incluse" : "" },
    { nome: "Prezzo netto suggerito", valore: proiezione?.venditaSuggerita == null ? "—" : euroAnalisi.format(proiezione.venditaSuggerita),
      nota: proiezione?.venditaSuggerita == null ? "" : proiezione.obiettivo },
    { nome: "Margine al prezzo attuale", valore: euro(proiezione?.margine ?? null), nota: "",
      perdita: (proiezione?.margine ?? 0) < 0 },
    { nome: "Fine prevista", valore: dateFine(previsione?.fine), nota: previsione
      ? `${previsione.giorni} ${previsione.giorni === 1 ? "giorno operativo" : "giorni operativi"}` : "" },
  ];
  return <section aria-label="Stima rapida della lavorazione" className="flex min-h-0 flex-1 flex-col">
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/70 px-3 py-3 sm:px-4">
      <div className="rounded-xl bg-[#193653] p-3 text-white">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-blue-200" aria-hidden="true" />Proposta per la lavorazione</h4>
          {fonti > 0 && <button type="button" className="inline-flex items-center gap-1 rounded text-xs text-blue-100 hover:underline"
            onClick={() => modifica("costi", "fonti")}><History className="h-3 w-3" aria-hidden="true" />
            {fonti === 1 ? "1 consuntivo · da verificare" : `${fonti} consuntivi`}
          </button>}
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-1.5">
          {misure.map(({ nome, valore, nota, perdita }) => <div key={nome} className="min-w-0 rounded-lg bg-white/10 p-2.5">
            <dt className="text-xs leading-tight text-blue-100">{nome}</dt>
            <dd className={`mt-1 text-sm font-semibold leading-tight tabular-nums sm:text-base ${perdita ? "text-rose-200" : ""}`}>{valore}</dd>
            {nota && <dd className="mt-0.5 text-xs leading-tight text-blue-100">{nota}</dd>}
          </div>)}
        </dl>
      </div>
      <div className="grid grid-cols-2 gap-2.5 rounded-xl border bg-white p-3">
        <label className="grid min-w-0 content-start gap-1 text-xs font-medium text-slate-700">Data di partenza
          <Input className="h-9 min-w-0 text-sm" type="date" value={piano.partenza} disabled={busy} onChange={e => impostaPartenza(e.target.value)} />
        </label>
        {esecuzione}
        <p className="col-span-2 text-xs text-slate-600">
          {modalitaEsecuzione[piano.esecuzione]}{conOperai(piano.esecuzione) && piano.operai && piano.oreGiorno
            ? ` · ${piano.operai} ${piano.operai === "1" ? "operaio" : "operai"} · ${piano.oreGiorno} h a turno` : ""}
        </p>
      </div>
      {statoStorico}
      {(problemiCosto.length > 0 || tempi.mancanti.length > 0) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <h4 className="font-semibold text-amber-950">Da completare</h4>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {problemiCosto.map(p => <Button key={p.campo} type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs text-amber-950"
            disabled={busy} onClick={() => modifica("costi", p.campo)}>{p.testo}<ArrowRight aria-hidden="true" /></Button>)}
          {tempi.problemi.map(p => <Button key={p.campo} type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs text-amber-950"
            disabled={busy} onClick={() => modifica("tempi", p.campo)}>{p.testo.charAt(0).toUpperCase() + p.testo.slice(1)}<ArrowRight aria-hidden="true" /></Button>)}
          {!tempi.problemi.length && tempi.mancanti.length > 0 && <Button type="button" variant="outline" size="sm"
            onClick={() => modifica("tempi")}>Controlla le durate</Button>}
        </div>
      </div>}
      {!stima && !statoStorico && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3">
        <p className="text-xs text-slate-700">{daiCostiInseriti ? "Nessun consuntivo confrontabile. Il riepilogo usa le risorse già compilate."
          : "Nessun consuntivo confrontabile. Usa le tariffe aziendali o compila le risorse della voce."}</p>
        <Button type="button" size="sm" variant="outline" onClick={rivediRisorse}>Apri risorse</Button>
      </div>}
      {confronta && <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" aria-expanded={mostraScenari} onClick={confronta}>
          {mostraScenari ? "Chiudi confronto" : "Confronta esecuzioni"}
        </Button>
      </div>}
      {mostraScenari && scenari.length > 0 && <div className="rounded-xl border bg-white p-3">
        <h4 className="text-sm font-semibold">Squadra interna, subappalto e misto</h4>
        <p className="mb-2 mt-0.5 text-xs text-slate-600">I costi includono le quote comuni disponibili. I giorni usano i consuntivi della singola modalità e lo stesso calendario.</p>
        <ul className="divide-y" aria-label="Confronto delle esecuzioni">
          {scenari.map(s => <li key={s.modo} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 py-2 text-xs">
            <div>
              <p className="font-semibold">{modalitaEsecuzione[s.modo]}</p>
              <p className="text-slate-600">{s.fonti ? `${s.fonti} ${s.fonti === 1 ? "consuntivo" : "consuntivi"}` : "Storico insufficiente"}</p>
            </div>
            {!!s.fonti && <div className="text-right tabular-nums">
              <p>{s.costo === null ? "Costo da completare" : `${euro(s.costo)} di costo`} · {s.giorni === null ? "tempi da completare" : `${s.giorni} gg operativi`}</p>
              {s.margine !== null && <p className={s.margine < 0 ? "text-red-700" : "text-slate-700"}>{euro(s.margine)} di margine</p>}
            </div>}
          </li>)}
        </ul>
      </div>}
    </div>
    {(rivediStima || salvaTempi || tempiSalvati) && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-white px-3 py-2 sm:px-4">
      {tempiSalvati && <span className="mr-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-800"><Check className="h-3.5 w-3.5" />Tempistiche salvate</span>}
      {salvaTempi && !tempiSalvati && <Button type="button" size="sm" variant={rivediStima ? "outline" : "default"}
        disabled={busy} onClick={previsione ? salvaTempi : () => modifica("tempi", primoCampo)}>
        <CalendarDays aria-hidden="true" />{previsione ? "Salva tempistiche" : "Completa tempistiche"}
      </Button>}
      {rivediStima && <Button type="button" size="sm" disabled={busy} onClick={rivediStima}>Rivedi proposta costi</Button>}
    </div>}
  </section>;
}
