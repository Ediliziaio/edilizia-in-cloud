/**
 * Il cronoprogramma dei lavori nel passo Documento del preventivo con computo:
 * Silvio lo propone dalle voci del computo, oppure si parte dai capitoli; le
 * fasi si correggono in riga (inizio e durata in giorni lavorativi) e il Gantt
 * si ridisegna mentre si scrive. Con «Nel PDF» esce in una pagina sua.
 */
import { useState } from "react";
import { CalendarRange, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { BozzaComputo } from "@/lib/computo/editorNativo";
import { cronoDaCapitoli, dataBreve, dataDelGiorno, durataTotale, leggiData, normalizzaFasi, richiestaCrono, type Cronoprogramma, type FaseCrono } from "@/lib/computo/cronoprogramma";

const intero = (s: string) => { const n = Number.parseInt(s, 10); return Number.isFinite(n) && n > 0 ? Math.min(2000, n) : 1; };

export default function ComputoCronoprogramma({ bozza, companyId, onChange }: {
  bozza: BozzaComputo; companyId?: string;
  onChange: (patch: Pick<Partial<BozzaComputo>, "cronoprogramma" | "mostraCronoprogrammaPdf">) => void;
}) {
  const crono = bozza.cronoprogramma;
  const [chiedendo, setChiedendo] = useState(false);
  const [indicazioni, setIndicazioni] = useState("");
  const cambia = (patch: Partial<Cronoprogramma>) => onChange({ cronoprogramma: { ...crono, ...patch } });
  const cambiaFase = (id: string, patch: Partial<FaseCrono>) => cambia({ fasi: crono.fasi.map(f => f.id === id ? { ...f, ...patch } : f) });
  const totale = durataTotale(crono);
  const inizio = leggiData(crono.dataInizio);
  const dataNonValida = !!crono.dataInizio.trim() && !inizio;

  const chiediASilvio = async () => {
    if (!companyId) return;
    setChiedendo(true);
    try {
      const { data, error } = await supabase.functions.invoke("computo-cronoprogramma", {
        body: { company_id: companyId, ...richiestaCrono(bozza), note: indicazioni.trim() || undefined },
      });
      if (error) {
        const contesto = (error as { context?: Response }).context;
        const dettaglio: { error?: string } | null = contesto ? await contesto.json().catch((): null => null) : null;
        throw new Error(dettaglio?.error || "Silvio non ha risposto: riprova tra qualche secondo.");
      }
      const risposta = data as { fasi?: { nome: string; inizio: number; durata: number; nota?: string }[]; nota?: string };
      const fasi = normalizzaFasi((risposta.fasi ?? []).map(f => ({ id: crypto.randomUUID(), nome: f.nome, inizio: f.inizio, durata: f.durata, nota: f.nota ?? "" })));
      if (!fasi.length) throw new Error("Silvio non ha proposto fasi: riprova, oppure parti dai capitoli.");
      onChange({ cronoprogramma: { ...crono, fasi, nota: risposta.nota ?? "" }, mostraCronoprogrammaPdf: true });
      toast.success("Cronoprogramma pronto", { description: `${fasi.length} fasi, ${durataTotale({ fasi })} giorni lavorativi. Correggile dove serve.` });
    } catch (e) { toast.error((e as Error).message); }
    finally { setChiedendo(false); }
  };

  return <section aria-label="Cronoprogramma dei lavori" className="space-y-3 rounded-lg border bg-white p-3">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="flex items-center gap-1.5 text-sm font-semibold"><CalendarRange className="h-4 w-4 text-slate-500" />Cronoprogramma dei lavori</h3>
        <p className="text-xs text-muted-foreground">{crono.fasi.length ? `${crono.fasi.length} fasi · ${totale} giorni lavorativi${inizio ? `, fine il ${dataDelGiorno(inizio, totale).toLocaleDateString("it-IT")}` : ""}` : "Le fasi del cantiere in giorni lavorativi: Silvio le prepara dalle voci del computo."}</p></div>
      {!!crono.fasi.length && <label className="flex items-center gap-2 text-sm">Nel PDF<Switch aria-label="Cronoprogramma nel PDF" checked={bozza.mostraCronoprogrammaPdf !== false} onCheckedChange={mostraCronoprogrammaPdf => onChange({ mostraCronoprogrammaPdf })} /></label>}
    </div>
    <div className="flex flex-wrap items-end gap-2">
      {companyId && <div className="min-w-[14rem] flex-1 space-y-1"><Label htmlFor="crono-indicazioni" className="text-xs">Indicazioni per Silvio (facoltative)</Label>
        <Input id="crono-indicazioni" className="h-9" maxLength={1000} placeholder="Es. due squadre, inizio a marzo, il cliente vuole giocare entro giugno" value={indicazioni} onChange={e => setIndicazioni(e.target.value)} /></div>}
      {companyId && <Button size="sm" className="bg-blue-950 text-white hover:bg-blue-900" disabled={chiedendo || !bozza.voci.length} onClick={() => { void chiediASilvio(); }}>
        {chiedendo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4 text-orange-300" />}{crono.fasi.length ? "Rifallo con Silvio" : "Crea con Silvio"}</Button>}
      <Button size="sm" variant="outline" disabled={chiedendo || !bozza.voci.length} onClick={() => onChange({ cronoprogramma: cronoDaCapitoli(bozza, crono.dataInizio), mostraCronoprogrammaPdf: true })}>Parti dai capitoli</Button>
    </div>
    {!!crono.fasi.length && <>
      <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="space-y-1"><Label htmlFor="crono-inizio" className="text-xs">Inizio lavori</Label>
          <Input id="crono-inizio" className="h-9" maxLength={20} placeholder="gg/mm/aaaa" value={crono.dataInizio} aria-invalid={dataNonValida} onChange={e => cambia({ dataInizio: e.target.value })} />
          {dataNonValida && <p className="text-[11px] text-amber-700">Scrivi la data come 15/03/2027.</p>}</div>
        <div className="space-y-1"><Label htmlFor="crono-nota" className="text-xs">Nota sotto il cronoprogramma</Label>
          <Input id="crono-nota" className="h-9" maxLength={1000} value={crono.nota} onChange={e => cambia({ nota: e.target.value })} /></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Fase</th><th className="w-20 py-1 pr-2 font-medium">Dal giorno</th><th className="w-20 py-1 pr-2 font-medium">Giorni</th><th className="py-1 font-medium">Andamento</th><th className="w-8" />
          </tr></thead>
          <tbody>{crono.fasi.map((f, k) => <tr key={f.id} className="border-t align-top">
            <td className="py-1.5 pr-2"><Input aria-label={`Nome della fase ${k + 1}`} className="h-8" maxLength={200} value={f.nome} onChange={e => cambiaFase(f.id, { nome: e.target.value })} />
              {f.nota && <p className="mt-0.5 text-[11px] text-muted-foreground">{f.nota}</p>}</td>
            <td className="py-1.5 pr-2"><Input aria-label={`Primo giorno della fase ${k + 1}`} className="h-8 tabular-nums" inputMode="numeric" value={String(f.inizio)} onChange={e => cambiaFase(f.id, { inizio: intero(e.target.value) })} /></td>
            <td className="py-1.5 pr-2"><Input aria-label={`Giorni della fase ${k + 1}`} className="h-8 tabular-nums" inputMode="numeric" value={String(f.durata)} onChange={e => cambiaFase(f.id, { durata: intero(e.target.value) })} /></td>
            <td className="py-1.5"><div className="relative mt-1.5 h-5 rounded bg-slate-100" aria-hidden="true">
              <span className="absolute inset-y-0 rounded bg-orange-500" style={{ left: `${(f.inizio - 1) / Math.max(1, totale) * 100}%`, width: `${Math.max(2, f.durata / Math.max(1, totale) * 100)}%` }} />
            </div>{inizio && <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{dataBreve(dataDelGiorno(inizio, f.inizio))} - {dataBreve(dataDelGiorno(inizio, f.inizio + f.durata - 1))}</p>}</td>
            <td className="py-1.5 pl-1"><Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Togli la fase ${k + 1}`} onClick={() => cambia({ fasi: crono.fasi.filter(x => x.id !== f.id) })}><Trash2 className="h-4 w-4" /></Button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <Button size="sm" variant="outline" disabled={crono.fasi.length >= 60} onClick={() => cambia({ fasi: [...crono.fasi, { id: crypto.randomUUID(), nome: "Nuova fase", inizio: totale + 1, durata: 1, nota: "" }] })}><Plus className="mr-1 h-4 w-4" />Aggiungi fase</Button>
    </>}
  </section>;
}
