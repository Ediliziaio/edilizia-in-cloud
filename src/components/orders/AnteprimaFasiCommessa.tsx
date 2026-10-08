import { useState } from "react";
import { ListOrdered, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FaseModello, ModelloFasi } from "@/lib/orders/modelliFasi";

interface Props {
  modello: ModelloFasi | null;
  fasi: FaseModello[];
  personalizzate: boolean;
  onChange: (fasi: FaseModello[]) => void;
  onRipristina: () => void;
}

export function AnteprimaFasiCommessa({ modello, fasi, personalizzate, onChange, onRipristina }: Props) {
  const [modifica, setModifica] = useState(false);
  const [tutte, setTutte] = useState(false);
  const sottofasi = fasi.reduce((n, f) => n + f.sottofasi.length, 0);
  const visibili = modifica || tutte ? fasi : fasi.slice(0, 4);
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-800"><ListOrdered className="h-4 w-4 text-orange-500" />{fasi.length} {fasi.length === 1 ? "fase" : "fasi"}{sottofasi > 0 ? ` · ${sottofasi} ${sottofasi === 1 ? "sottofase" : "sottofasi"}` : ""}</span>
        <Button type="button" variant="outline" size="sm" className="h-8 bg-white text-xs" aria-expanded={modifica} onClick={() => setModifica(!modifica)}>{modifica ? "Fine modifica" : "Adatta alla commessa"}</Button>
      </div>
      {fasi.length > 0 ? <ol className="divide-y divide-slate-100 border-t border-slate-200">
        {visibili.map((fase, i) => <li key={i} className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-xs font-medium text-slate-400">{String(i + 1).padStart(2, "0")}</span>
            {modifica ? <Input aria-label={`Nome fase ${i + 1}`} maxLength={160} value={fase.nome} className="h-9 min-w-0 flex-1 bg-white text-sm" onChange={(e) => onChange(fasi.map((f, j) => j === i ? { ...f, nome: e.target.value } : f))} /> : <span className="min-w-0 flex-1 break-words text-sm text-slate-700">{fase.nome || "Fase senza nome"}</span>}
            {modifica && <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-slate-500 hover:text-red-600" aria-label={`Rimuovi fase ${i + 1}`} onClick={() => onChange(fasi.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
          </div>
          {fase.sottofasi.length > 0 && <details className="ml-7 mt-1 text-xs text-slate-500">
            <summary className="cursor-pointer py-1">{fase.sottofasi.length} {fase.sottofasi.length === 1 ? "sottofase" : "sottofasi"}</summary>
            <ul className="mt-1 space-y-1 border-l border-slate-200 pl-3">{fase.sottofasi.map((s, j) => <li key={j} className="break-words">{s.nome}</li>)}</ul>
          </details>}
        </li>)}
      </ol> : <p className="px-3 pb-3 text-xs text-slate-500">Nessuna fase iniziale. Puoi aggiungerle ora o dal Cantiere.</p>}
      {!modifica && fasi.length > 4 && <Button type="button" variant="ghost" size="sm" className="mx-3 mb-2 h-9 text-xs text-blue-800" aria-expanded={tutte} onClick={() => setTutte(!tutte)}>{tutte ? "Mostra meno" : `Mostra tutte le ${fasi.length} fasi`}</Button>}
      {fasi.some((fase) => !fase.nome.trim()) && <p role="alert" className="px-3 pb-2 text-xs text-red-600">Assegna un nome alle fasi vuote o rimuovile prima di creare la commessa.</p>}
      {modifica && <div className="flex flex-wrap gap-2 border-t border-slate-200 px-3 py-2">
        <Button type="button" variant="outline" size="sm" className="h-9 bg-white text-xs" disabled={fasi.length >= 60} onClick={() => onChange([...fasi, { nome: "", sottofasi: [] }])}><Plus className="mr-1 h-3.5 w-3.5" />Aggiungi fase</Button>
        {modello && personalizzate && <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={onRipristina}>Ripristina modello</Button>}
      </div>}
      <p className="border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500">{personalizzate ? "Modifiche solo per questa commessa. " : ""}Date delle singole fasi, squadra e materiali si organizzano poi nel Cantiere.</p>
    </div>
  );
}
