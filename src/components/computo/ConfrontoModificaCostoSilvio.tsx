import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/formatters";
import {
  analizzaPreventivo, centesimiCosto, costoCompletoVoce, numeroCosto, quoteCostiComuni, soldi,
  type AnalisiCosti, type RisorsaCosto, type VoceAnalisi,
} from "@/lib/preventivi/analisiCosti";
import { conCostiRisorse } from "@/lib/preventivi/modificaCostoSilvio";

type Calcolo = ReturnType<typeof analizzaPreventivo>;
const percentuale = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const tariffa = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 6 });
const euro = (centesimi: number | null) => centesimi === null ? "Da completare" : formatCurrency(soldi(centesimi));

function margineVoce(calcolo: Calcolo, id: string, datiValidi: boolean) {
  const riga = calcolo.righe.find(r => r.voce.id === id);
  if (!datiValidi || !riga || riga.voce.vendita === null) return null;
  const costo = costoCompletoVoce(riga, quoteCostiComuni(calcolo).get(id));
  return costo === null ? null : centesimiCosto(riga.voce.vendita) - costo;
}

function marginePreventivo(calcolo: Calcolo, datiValidi: boolean) {
  const incluse = calcolo.righe.filter(r => r.voce.inclusa);
  return datiValidi && !calcolo.incompleto && incluse.length && incluse.every(r => r.voce.vendita !== null) ? calcolo.margine : null;
}

export default function ConfrontoModificaCostoSilvio({ analisi, voci, imponibile, erroreSconto, voce, risorse, superata, bozzaCommerciale,
  onRicalcola, onAnnulla, onSalva }: {
  analisi: AnalisiCosti;
  voci: readonly VoceAnalisi[];
  imponibile: number;
  erroreSconto?: string | null;
  voce: VoceAnalisi;
  risorse: { risorsa: RisorsaCosto; prezzoIniziale: string }[];
  superata: boolean;
  bozzaCommerciale: boolean;
  onRicalcola: () => void;
  onAnnulla: () => void;
  onSalva: (valore: AnalisiCosti) => Promise<void>;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const salvataggio = useRef(false);
  const [testiPrezzi, setTestiPrezzi] = useState(() => risorse.map(({ prezzoIniziale }) => prezzoIniziale));
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const piuRisorse = risorse.length > 1;
  const prezziAttuali = risorse.map(({ risorsa }) => numeroCosto(risorsa.prezzo));
  const prezziNuovi = testiPrezzi.map(numeroCosto);
  const cambiati = prezziNuovi.some((prezzo, indice) => prezzo !== prezziAttuali[indice]);
  const prima = useMemo(() => analizzaPreventivo(analisi, voci, imponibile), [analisi, voci, imponibile]);
  const candidato = useMemo(() => {
    const cambi = testiPrezzi.flatMap((testo, indice) => {
      const prezzo = numeroCosto(testo);
      return prezzo === null ? [] : [{ id: risorse[indice].risorsa.id, prezzo }];
    });
    return cambi.length === risorse.length ? conCostiRisorse(analisi, voce.id, cambi) : null;
  }, [analisi, voce.id, risorse, testiPrezzi]);
  const dopo = useMemo(() => candidato ? analizzaPreventivo(candidato, voci, imponibile) : null, [candidato, voci, imponibile]);
  const primaVoce = margineVoce(prima, voce.id, !erroreSconto);
  const dopoVoce = dopo ? margineVoce(dopo, voce.id, !erroreSconto) : null;
  const primaTotale = marginePreventivo(prima, !erroreSconto);
  const dopoTotale = dopo ? marginePreventivo(dopo, !erroreSconto) : null;
  const variazione = primaTotale !== null && dopoTotale !== null ? dopoTotale - primaTotale
    : primaVoce !== null && dopoVoce !== null ? dopoVoce - primaVoce : null;
  const mostraMargineVoce = !voce.inclusa || voci.filter(r => r.inclusa).length > 1;

  useEffect(() => { input.current?.focus(); }, []);

  async function conferma() {
    if (!candidato || !cambiati || superata || salvataggio.current) return;
    salvataggio.current = true;
    setBusy(true);
    setErrore("");
    try { await onSalva(candidato); }
    catch (e) { setErrore(e instanceof Error ? e.message : "Il costo non è stato salvato. Riprova."); }
    finally { salvataggio.current = false; setBusy(false); }
  }

  const righe = [
    ...risorse.map(({ risorsa }, indice) => [
      piuRisorse ? `${risorsa.nome} · costo unitario` : "Costo unitario",
      prezziAttuali[indice] === null ? "Da completare" : tariffa.format(prezziAttuali[indice]!),
      prezziNuovi[indice] === null ? "—" : tariffa.format(prezziNuovi[indice]!),
    ]),
    ["Costi del preventivo", euro(prima.costo), dopo ? euro(dopo.costo) : "—"],
    ...(mostraMargineVoce ? [["Margine della voce", euro(primaVoce), dopo ? euro(dopoVoce) : "—"]] : []),
    ["Margine del preventivo", euro(primaTotale), dopo ? euro(dopoTotale) : "—"],
  ];
  if (primaTotale !== null && prima.percentuale !== null && dopo?.percentuale != null && dopoTotale !== null) {
    righe.push(["Margine %", percentuale.format(prima.percentuale) + "%", percentuale.format(dopo.percentuale) + "%"]);
  }

  return <section aria-label="Anteprima della modifica al costo" className="border-b border-blue-200 bg-blue-50/60 p-3 sm:p-4">
    <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h3 className="break-words text-sm font-semibold text-slate-900">{piuRisorse ? "Modifica costi della voce" : risorse[0].risorsa.nome}</h3>
        <p className="line-clamp-1 text-xs text-slate-600">{[voce.codice, voce.descrizione].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        {risorse.map(({ risorsa }, indice) => <div key={risorsa.id} className="min-w-0">
          <label htmlFor={`${id}-${indice}`} className="block break-words text-xs font-medium text-slate-700">
            {piuRisorse ? risorsa.nome : "Nuovo costo unitario"} {risorsa.unita && <span className="text-slate-500">(€/{risorsa.unita})</span>}
          </label>
          <Input ref={indice === 0 ? input : undefined} id={`${id}-${indice}`} inputMode="decimal" className="mt-1 h-9 w-36 bg-white text-base sm:text-sm" maxLength={32}
            value={testiPrezzi[indice]} disabled={busy} aria-invalid={prezziNuovi[indice] === null}
            onChange={e => {
              const valore = e.currentTarget.value;
              setTestiPrezzi(testi => testi.map((testo, posizione) => posizione === indice ? valore : testo));
              setErrore("");
            }} />
        </div>)}
      </div>
    </div>
    {superata ? <div className="flex flex-wrap items-center gap-2 text-xs text-amber-900" role="alert">
      L’analisi è stata aggiornata. Ricalcola il margine con i costi correnti.
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setErrore(""); onRicalcola(); }}>Ricalcola confronto</Button>
    </div> : <div className="overflow-hidden rounded-lg border border-blue-100 bg-white">
      <table aria-label="Confronto margine prima di confermare" className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-600"><tr className="[&>th]:px-2.5 [&>th]:py-1.5 [&>th]:font-medium">
          <th scope="col">Valori al netto IVA</th><th scope="col" className="text-right">Attuale</th><th scope="col" className="text-right">Proposto</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{righe.map(([nome, attuale, proposto]) =>
          <tr key={nome} className="[&>*]:p-2"><th scope="row" className="font-medium">{nome}</th><td className="text-right tabular-nums">{attuale}</td>
            <td className="text-right font-semibold tabular-nums">{proposto}</td></tr>)}</tbody>
      </table>
    </div>}
    {bozzaCommerciale && <p className="mt-2 text-xs text-slate-600">Il confronto usa le quantità e la vendita del computo salvato.</p>}
    {prima.incompleto && <p className="mt-2 text-xs text-slate-600">Alcuni costi del preventivo sono ancora da completare.</p>}
    {errore && <p role="alert" className="mt-2 text-xs text-red-700">{errore}</p>}
    <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
      {variazione !== null && variazione !== 0 && !superata && <p className="mr-auto text-xs font-medium text-slate-700">
        {dopoTotale !== null && primaTotale !== null ? "Variazione margine" : "Variazione margine voce"} {variazione > 0 ? "+" : ""}{euro(variazione)}
      </p>}
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onAnnulla}>Annulla</Button>
      <Button type="button" size="sm" disabled={busy || superata || !candidato || !cambiati} onClick={() => void conferma()}>
        {busy ? "Salvataggio…" : piuRisorse ? "Conferma costi" : "Conferma costo"}
      </Button>
    </div>
  </section>;
}
