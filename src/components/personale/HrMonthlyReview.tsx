import { useMemo, useState } from "react";
import { useGiornate } from "@/hooks/useGiornate";
import { useRichieste } from "@/hooks/useRichieste";
import { useAllHrProfili } from "@/hooks/useOrganigramma";
import { useHrFestivita } from "@/hooks/useHrFestivita";
import { workingDates } from "@/lib/personale/calendarioLavorativo";
import { HrQueryError } from "@/components/hr/HrQueryError";
import { Button } from "@/components/ui/button";
import { oggiRoma } from "@/hooks/useOperai";
import { giornataDaVerificare } from "@/lib/personale/presenze";
import { HrMonthClosure } from "@/components/personale/HrMonthClosure";

export function HrMonthlyReview({ mese }: { mese: string }) {
  const [open, setOpen] = useState(false);
  return <section className="rounded-xl border bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Controllo mensile</h3>
      <p className="text-sm text-muted-foreground">Richieste, anomalie e copertura delle giornate prima di preparare i dati per il consulente.</p></div>
      <Button variant="outline" size="sm" aria-expanded={open} onClick={()=>setOpen(!open)}>{open ? "Nascondi controllo" : "Verifica il mese"}</Button></div>
    {open && <Review key={mese} mese={mese} />}
  </section>;
}

function Review({ mese }: { mese: string }) {
  const today=oggiRoma();
  const end=`${mese}-${String(new Date(Number(mese.slice(0,4)),Number(mese.slice(5,7)),0).getDate()).padStart(2,"0")}`;
  const days=useGiornate(`${mese}-01`,end), requests=useRichieste({meseAnno:mese}), people=useAllHrProfili(), calendar=useHrFestivita();
  const loading=days.isLoading || requests.isLoading || people.isLoading || calendar.isLoading;
  const failed=days.isError || requests.isError || people.isError || calendar.isError;
  const summary=useMemo(()=>{
    const last=end < today ? end : today;
    const rows=days.data || [], profiles=people.data || [];
    const recorded=new Set(rows.map(r=>`${r.profilo_id}:${r.data}`));
    let missing=0, unknown=0;
    const byPerson: {id:string;name:string;missing:number|null}[]=[];
    for (const person of profiles) {
      // Do not invent employment dates for historical profiles.
      if (!person.attivo && !person.data_cessazione) continue;
      const start=[`${mese}-01`,person.data_assunzione || `${mese}-01`].sort().at(-1)!;
      const stop=[last,person.data_cessazione || last].sort()[0];
      if (start>stop) continue;
      try {
        const count=workingDates(start,stop,person.giorni_lavorativi || [],calendar.data || [])
          .filter(date=>!recorded.has(`${person.id}:${date}`)).length;
        missing+=count; if(count) byPerson.push({id:person.id,name:`${person.nome} ${person.cognome}`,missing:count});
      } catch { unknown++;byPerson.push({id:person.id,name:`${person.nome} ${person.cognome}`,missing:null}); }
    }
    return { missing,unknown,byPerson,
      anomalies:rows.filter(r=>giornataDaVerificare(r,today)).length,
      pending:(requests.data || []).filter(r=>r.stato==="in_attesa").length,
      rows:rows.length,
      incompleteEmployment:profiles.filter(p=>p.attivo && !p.data_assunzione).length,
    };
  },[days.data,requests.data,people.data,calendar.data,end,mese,today]);
  if(loading) return <p role="status" className="mt-4 text-sm">Verifica dei registri in corso…</p>;
  if(failed) return <div className="mt-4"><HrQueryError label="Controllo mensile incompleto" onRetry={()=>Promise.all([days.refetch(),requests.refetch(),people.refetch(),calendar.refetch()])} /></div>;
  return <div className="mt-4 space-y-3">
    <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
      {[["Giornate registrate",summary.rows],["Anomalie da verificare",summary.anomalies],["Richieste in attesa",summary.pending],["Giornate senza registrazione",summary.missing]].map(([label,value])=><div key={label} className="rounded-lg bg-slate-50 p-3"><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold">{value}</dd></div>)}
    </dl>
    <p className="text-xs text-muted-foreground">Copertura fino al {end < today ? end : today}, sui calendari configurati e sulle date contrattuali disponibili. Una giornata senza registrazione non è un’assenza. {summary.unknown > 0 && `${summary.unknown} calendari personali non configurati: copertura non calcolabile per queste persone.`}</p>
    {summary.incompleteEmployment>0 && <p className="text-sm text-amber-800">{summary.incompleteEmployment} profili attivi senza data di assunzione: completali prima di chiudere il mese.</p>}
    {summary.byPerson.length>0 && <details><summary className="cursor-pointer text-sm font-medium">Dettaglio copertura per persona ({summary.byPerson.length})</summary><ul className="mt-2 max-h-64 space-y-1 overflow-auto text-sm">{summary.byPerson.map(p=><li key={p.id}>{p.name}: {p.missing==null ? "calendario da configurare" : `${p.missing} giornate da verificare`}</li>)}</ul></details>}
    <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">La verifica non chiude il mese automaticamente e non invia dati al consulente. La chiusura richiede una conferma separata. Le ore di cantiere restano nel loro registro, distinte dalle ore HR.</p>
    <HrMonthClosure month={mese} ready={end<today && summary.rows>0 && summary.anomalies===0 && summary.pending===0 && summary.missing===0 && summary.unknown===0 && summary.incompleteEmployment===0}/>
  </div>;
}
