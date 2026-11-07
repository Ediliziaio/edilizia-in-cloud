import { useState } from "react";
import { CalendarDays, ListOrdered, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FaseModello, ModelloFasi } from "@/lib/orders/modelliFasi";
import type { FasePianificata, PianoFasi } from "@/lib/orders/pianoFasiNuovaCommessa";
import { cn } from "@/lib/utils";

interface Props {
  modello: ModelloFasi | null;
  fasi: FaseModello[];
  personalizzate: boolean;
  onChange: (fasi: FaseModello[]) => void;
  onRipristina: () => void;
  /** Le date calcolate dalle date dei lavori (07/11/2026); senza, il riquadro mostra solo i nomi. */
  piano?: PianoFasi;
}

const breve = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const ORIGINE: Record<NonNullable<FasePianificata["origine"]>, string> = {
  mano: "durata scritta da te",
  sottofasi: "dalla durata delle sottofasi",
  divisi: "tempo dei lavori diviso fra le fasi",
};

function DateFase({ r }: { r: FasePianificata | undefined }) {
  if (!r?.giorni) return <span className="shrink-0 text-[11px] text-slate-400">—</span>;
  return (
    <span className="shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-slate-600" title={r.origine ? ORIGINE[r.origine] : undefined}>
      {r.giorni} gg{r.dal && r.al ? <> · {breve(r.dal)} → {breve(r.al)}</> : null}
    </span>
  );
}

export function AnteprimaFasiCommessa({ modello, fasi, personalizzate, onChange, onRipristina, piano }: Props) {
  const [modifica, setModifica] = useState(false);
  const [tutte, setTutte] = useState(false);
  const sottofasi = fasi.reduce((n, f) => n + f.sottofasi.length, 0);
  const visibili = modifica || tutte ? fasi : fasi.slice(0, 4);
  const conDate = piano?.righe.filter((r) => r.dal) ?? [];
  const primo = conDate[0]?.dal ?? null;
  const ultimo = piano?.fineFasi ?? null;
  const cambiaGiorni = (i: number, testo: string) => {
    const n = Number.parseInt(testo, 10);
    const giorni = Number.isFinite(n) && n >= 1 ? Math.min(n, 3650) : null;
    onChange(fasi.map((f, j) => (j === i ? { ...f, giorni } : f)));
  };
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-slate-800">
          <ListOrdered className="h-4 w-4 text-orange-500" />{fasi.length} {fasi.length === 1 ? "fase" : "fasi"}{sottofasi > 0 ? ` · ${sottofasi} ${sottofasi === 1 ? "sottofase" : "sottofasi"}` : ""}
          {primo && ultimo && <span className="inline-flex items-center gap-1 text-xs font-normal text-slate-600"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />dal {breve(primo)} al {breve(ultimo)}</span>}
        </span>
        <Button type="button" variant="outline" size="sm" className="h-8 bg-white text-xs" aria-expanded={modifica} onClick={() => setModifica(!modifica)}>{modifica ? "Fine modifica" : "Adatta alla commessa"}</Button>
      </div>
      {fasi.length > 0 ? <ol className="divide-y divide-slate-100 border-t border-slate-200">
        {visibili.map((fase, i) => <li key={i} className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-xs font-medium text-slate-400">{String(i + 1).padStart(2, "0")}</span>
            {modifica ? <Input aria-label={`Nome fase ${i + 1}`} maxLength={160} value={fase.nome} className="h-9 min-w-0 flex-1 bg-white text-sm" onChange={(e) => onChange(fasi.map((f, j) => j === i ? { ...f, nome: e.target.value } : f))} /> : <span className="min-w-0 flex-1 break-words text-sm text-slate-700">{fase.nome || "Fase senza nome"}</span>}
            {modifica && piano ? (
              <label className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
                <Input aria-label={`Giorni di lavoro fase ${i + 1}`} inputMode="numeric" className="h-9 w-14 bg-white px-2 text-right text-sm tabular-nums"
                  placeholder={piano.righe[i]?.giorni ? String(piano.righe[i].giorni) : "gg"}
                  value={fase.giorni ? String(fase.giorni) : ""} onChange={(e) => cambiaGiorni(i, e.target.value.replace(/\D/g, ""))} />
                gg
              </label>
            ) : piano ? <DateFase r={piano.righe[i]} /> : null}
            {modifica && <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-slate-500 hover:text-red-600" aria-label={`Rimuovi fase ${i + 1}`} onClick={() => onChange(fasi.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
          </div>
          {modifica && piano?.righe[i]?.dal && piano.righe[i].al && (
            <p className="ml-7 mt-1 text-[11px] tabular-nums text-slate-500">{breve(piano.righe[i].dal!)} → {breve(piano.righe[i].al!)}{!fase.giorni && piano.righe[i].origine ? ` · ${ORIGINE[piano.righe[i].origine!]}` : ""}</p>
          )}
          {fase.sottofasi.length > 0 && <details className="ml-7 mt-1 text-xs text-slate-500">
            <summary className="cursor-pointer py-1">{fase.sottofasi.length} {fase.sottofasi.length === 1 ? "sottofase" : "sottofasi"}</summary>
            <ul className="mt-1 space-y-1 border-l border-slate-200 pl-3">{fase.sottofasi.map((s, j) => <li key={j} className="break-words">{s.nome}</li>)}</ul>
          </details>}
        </li>)}
      </ol> : <p className="px-3 pb-3 text-xs text-slate-500">Nessuna fase iniziale. Puoi aggiungerle ora o dal Cantiere.</p>}
      {!modifica && fasi.length > 4 && <Button type="button" variant="ghost" size="sm" className="mx-3 mb-2 h-9 text-xs text-blue-800" aria-expanded={tutte} onClick={() => setTutte(!tutte)}>{tutte ? "Mostra meno" : `Mostra tutte le ${fasi.length} fasi`}</Button>}
      {fasi.some((fase) => !fase.nome.trim()) && <p role="alert" className="px-3 pb-2 text-xs text-red-600">Assegna un nome alle fasi vuote o rimuovile prima di creare la commessa.</p>}
      {piano?.oltreFine && ultimo && <p role="status" className="px-3 pb-2 text-xs text-amber-800">Le fasi finiscono il {breve(ultimo)}, dopo la fine dei lavori: accorcia qualche fase o sposta la fine.</p>}
      {modifica && <div className="flex flex-wrap gap-2 border-t border-slate-200 px-3 py-2">
        <Button type="button" variant="outline" size="sm" className="h-9 bg-white text-xs" disabled={fasi.length >= 60} onClick={() => onChange([...fasi, { nome: "", sottofasi: [] }])}><Plus className="mr-1 h-3.5 w-3.5" />Aggiungi fase</Button>
        {modello && personalizzate && <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={onRipristina}>Ripristina modello</Button>}
      </div>}
      <p className={cn("border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500")}>
        {personalizzate ? "Modifiche solo per questa commessa. " : ""}
        {!piano ? "Date delle singole fasi, squadra e materiali si organizzano poi nel Cantiere."
          : primo ? "Le fasi partono una dopo l'altra sui giorni di lavoro. In «Adatta alla commessa» cambi i giorni di ogni fase; squadra e materiali si organizzano poi nel Cantiere."
          : "Metti l'inizio dei lavori e le fasi prendono le loro date, una dopo l'altra."}
      </p>
    </div>
  );
}
