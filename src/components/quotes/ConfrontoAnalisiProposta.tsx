import { ArrowRight, CalendarDays, CircleAlert } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { euroAnalisi, soldi } from "@/lib/preventivi/analisiCosti";
import type { confrontaAnalisiProposta, proponiTempisticheLavorazione } from "@/lib/preventivi/anteprimaAnalisiCosti";
import type { PropostaAnalisiCosti } from "@/lib/preventivi/proposteAnalisiCosti";
import { formatoDataStima } from "@/lib/preventivi/stimaTempistiche";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Confronto = ReturnType<typeof confrontaAnalisiProposta>;
type DateProposte = ReturnType<typeof proponiTempisticheLavorazione>;
type T = ReturnType<typeof useT>;
const euro = (centesimi: number | null) => centesimi === null ? "—" : euroAnalisi.format(soldi(centesimi));
const costo = (t: T, { costo, completo }: { costo: number; completo: boolean }) =>
  completo ? euro(costo) : costo ? t("{importo} parziale", { importo: euro(costo) }) : t("Da completare");
const ultimoGiorno = (t: T, fine?: string) => fine ? formatoDataStima(fine) : t("Da pianificare");
const periodo = (t: T, situazione: Confronto["righe"][number]["prima"]) => situazione.date
  ? situazione.date.inizio === situazione.date.fine ? formatoDataStima(situazione.date.fine)
    : `${formatoDataStima(situazione.date.inizio)} – ${formatoDataStima(situazione.date.fine)}`
  : situazione.dateDaRicalcolare ? t("Da ricalcolare") : t("Da pianificare");

const fineAnteprima = (t: T, r: Confronto["dopo"]) =>
  t("{fine} · {pianificate}/{totale} voci", { fine: ultimoGiorno(t, r.fine), pianificate: r.pianificate, totale: r.totale });

function ImportoAffiancato({ titolo, prima, dopo, perdita }: { titolo: string; prima: string; dopo: string; perdita?: boolean }) {
  const t = useT();
  return <div className="min-w-0 rounded-lg bg-white/10 px-3 py-2.5">
    <h4 className="text-xs font-medium text-blue-100">{titolo}</h4>
    <dl className="mt-1.5 grid grid-cols-2 gap-2 break-words text-sm tabular-nums">
      <div><dt className="text-xs text-blue-100">{t("Attuale")}</dt><dd>{prima}</dd></div>
      <div><dt className="text-xs text-blue-100">{t("Proposta")}</dt><dd className={perdita ? "font-semibold text-rose-200" : "font-semibold text-white"}>{dopo}</dd></div>
    </dl>
  </div>;
}

function Differenza({ titolo, prima, dopo, perdita }: { titolo: string; prima: string; dopo: string; perdita?: boolean }) {
  const t = useT();
  return <div className="min-w-0 text-xs tabular-nums">
    <dt className="mb-0.5 font-medium text-slate-600 sm:sr-only">{titolo}</dt>
    <dd className="flex min-w-0 flex-wrap items-baseline gap-x-1 break-words">
      {prima !== dopo && <>
        <span className="text-slate-500"><span className="sr-only">{t("Attuale")} </span>{prima}</span>
        <ArrowRight className="h-3 w-3 shrink-0 self-center text-slate-500" aria-hidden="true" />
        <span className="sr-only">{t("Proposta")} </span>
      </>}
      <strong className={`font-medium ${perdita ? "text-red-700" : "text-slate-900"}`}>{dopo}</strong>
    </dd>
  </div>;
}

export function RiepilogoConfrontoProposta({ confronto }: { confronto: Confronto }) {
  const t = useT();
  const { prima, dopo } = confronto;
  return <div className="rounded-xl bg-[#193653] p-3 text-white" aria-label={t("Confronto totale")}>
    <div className="mb-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
      <h4 className="font-semibold">{t("Totale delle voci incluse")}</h4>
      <span className="text-xs text-blue-100">{t("Vendita netta")} <strong className="ml-1 text-white">{euro(dopo.vendita)}</strong></span>
    </div>
    <div className="grid grid-cols-1 gap-2 min-[580px]:grid-cols-3">
      <ImportoAffiancato titolo={t("Costo con quote comuni")} prima={costo(t, { costo: prima.costo, completo: prima.totale > 0 && prima.completi === prima.totale })}
        dopo={costo(t, { costo: dopo.costo, completo: dopo.totale > 0 && dopo.completi === dopo.totale })} />
      <ImportoAffiancato titolo={t("Margine al prezzo attuale")} prima={euro(prima.margine)} dopo={euro(dopo.margine)} perdita={(dopo.margine ?? 0) < 0} />
      <ImportoAffiancato titolo={t("Ultima fine stimata")} prima={fineAnteprima(t, prima)} dopo={fineAnteprima(t, dopo)} />
    </div>
    {dopo.totale > dopo.completi && <p className="mt-2 text-xs text-blue-100">
      {t(dopo.totale - dopo.completi === 1 ? "Costi da completare per {n} voce." : "Costi da completare per {n} voci.", { n: dopo.totale - dopo.completi })}
    </p>}
  </div>;
}

export default function ConfrontoAnalisiProposta({ confronto, costi, date, modificabili, escluse, busy, onSelezione }: {
  confronto: Confronto;
  costi: ReadonlyMap<string, PropostaAnalisiCosti>;
  date: ReadonlyMap<string, DateProposte>;
  modificabili: ReadonlySet<string>;
  escluse: ReadonlySet<string>;
  busy: boolean;
  onSelezione: (id: string, attiva: boolean) => void;
}) {
  const tr = useT();
  const { righe } = confronto;
  const gruppi = new Map<string, typeof righe>();
  for (const r of righe) {
    const gruppo = gruppi.get(r.voce.fase) ?? [];
    gruppo.push(r);
    gruppi.set(r.voce.fase, gruppo);
  }
  const cambianoDate = righe.some(r => r.dopo.date !== r.prima.date);
  const intervalli = cambianoDate ? righe.flatMap(r => r.voce.inclusa && r.dopo.date ? [r.dopo.date] : [])
    .sort((a, b) => a.inizio.localeCompare(b.inizio)) : [];
  let ultimaFine = "";
  let sovrapposte = false;
  for (const t of intervalli) {
    if (t.inizio <= ultimaFine) {
      sovrapposte = true;
      break;
    }
    ultimaFine = t.fine;
  }
  return <>
    {sovrapposte && <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
      <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />{tr("Alcune lavorazioni hanno finestre sovrapposte. Verifica che possano procedere insieme.")}
    </p>}
    <ul className="divide-y overflow-hidden rounded-lg border bg-white" aria-label={tr("Esito per lavorazione")}>
      <li className="hidden grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2 bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 sm:grid"
        aria-hidden="true"><span>{tr("Lavorazione")}</span><span>{tr("Costo con quote")}</span><span>{tr("Margine")}</span><span>{tr("Inizio e fine")}</span></li>
      {[...gruppi].map(([fase, righeFase]) => <li key={fase}>
        {!!fase && <h4 className="border-b bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">{fase} <span className="ml-1 font-normal text-slate-600">{righeFase.length}</span></h4>}
        <ul className="divide-y">
          {righeFase.map(({ voce, prima: attuale, dopo: proposta }) => {
            const esitoCosto = costi.get(voce.id);
            const esitoData = date.get(voce.id);
            const modificabile = modificabili.has(voce.id);
            return <li className="grid grid-cols-1 gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.1fr)]" key={voce.id}>
              <div className="flex min-w-0 items-start gap-2">
                {modificabile && <Checkbox className="mt-1" checked={!escluse.has(voce.id)} disabled={busy}
                  aria-label={tr("Includi proposta per {voce}", { voce: voce.descrizione })} onCheckedChange={v => onSelezione(voce.id, v === true)} />}
                <div className="min-w-0">
                  <p title={voce.descrizione} className="line-clamp-2 break-words text-sm font-medium">{voce.descrizione}</p>
                  <p className="text-xs text-slate-600">
                    {[voce.codice, voce.quantita != null ? `${voce.quantita} ${voce.unita}` : null, !voce.inclusa ? tr("Alternativa fuori dal totale") : null].filter(Boolean).join(" · ")}
                  </p>
                  {esitoCosto && <p className={`mt-1 text-xs ${esitoCosto.risorse.length ? "text-blue-800" : "text-slate-600"}`}>{esitoCosto.esito}</p>}
                  {!!esitoCosto?.fonti.length && <details className="mt-0.5 text-xs text-slate-600">
                    <summary className="cursor-pointer">{tr("Fonti del costo")}</summary>
                    <div className="break-words">{esitoCosto.fonti.join(", ")}</div>
                  </details>}
                </div>
              </div>
              <div className="min-w-0 sm:contents">
                <dl className="grid min-w-0 grid-cols-2 gap-x-2 gap-y-1.5 sm:contents">
                  <Differenza titolo={tr("Costo con quote")} prima={costo(tr, attuale)} dopo={costo(tr, proposta)} />
                  <Differenza titolo={tr("Margine")} prima={euro(attuale.margine)} dopo={euro(proposta.margine)} perdita={(proposta.margine ?? 0) < 0} />
                  <Differenza titolo={tr("Inizio e fine")} prima={periodo(tr, attuale)} dopo={periodo(tr, proposta)} />
                </dl>
                {!!esitoData?.problemi.length && <p className="mt-1 flex items-start gap-1 text-xs text-amber-900 sm:col-span-3 sm:col-start-2">
                  <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{esitoData.problemi.join(" · ")}
                </p>}
              </div>
            </li>;
          })}
        </ul>
      </li>)}
    </ul>
  </>;
}
