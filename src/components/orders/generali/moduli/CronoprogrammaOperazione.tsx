import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UniformSelect } from "@/components/ui/uniform-select";
import type { FaseOperazione } from "@/hooks/useMovimentiOperazione";
import {
  barra, fasiCronoprogramma, giornoLocale, intervalloCronoprogramma, intervalloPrevistoFase,
  intervalloRealeFase, lavoroRealeFasi, ritardoFase, tacche, type RapportinoFasi,
} from "@/lib/orders/cronoprogramma";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { cn } from "@/lib/utils";
import { dataBreve } from "../piano/formato";

export function CronoprogrammaOperazione({ riepilogo, fasi, rapportini, onApri }: {
  riepilogo: RiepilogoGenerale;
  fasi: FaseOperazione[];
  rapportini: RapportinoFasi[];
  onApri: (orderId: string, faseId?: string) => void;
}) {
  const [periodo, setPeriodo] = useState<"previsto" | "confronto">("confronto");
  const [filtro, setFiltro] = useState("tutte");
  const oggi = giornoLocale(new Date().toISOString());
  const fasiPerId = new Map(fasi.map(f => [f.id, f.order_id]));
  const fasiPerCommessa = new Map<string, ReturnType<typeof fasiCronoprogramma>>();
  const calendario = fasiCronoprogramma(fasi.map(f => ({
    ...f, percentuale: f.percentuale ?? 0, completata_il: f.completata_il ? giornoLocale(f.completata_il) : null,
  })), lavoroRealeFasi(rapportini), oggi);
  const fasiVisibili = calendario.filter(fase => {
    if (filtro === "ritardi") return fase.stato !== "completata" && !!ritardoFase(fase);
    if (filtro === "date") return fase.stato !== "completata" && (!fase.previstoInizio || !fase.previstoFine || fase.dateIncoerenti);
    return true;
  });
  for (const fase of fasiVisibili) {
    const orderId = fasiPerId.get(fase.id)!;
    const gruppo = fasiPerCommessa.get(orderId) ?? [];
    gruppo.push(fase);
    fasiPerCommessa.set(orderId, gruppo);
  }
  const asse = intervalloCronoprogramma(calendario, [], oggi, periodo);
  const segni = tacche(asse, asse.giorni > 75 ? "mesi" : "settimane");
  const passo = Math.max(1, Math.ceil(segni.length / 12));
  const etichette = segni.filter((_, i) => i % passo === 0);
  const oggiVisibile = oggi >= asse.da && oggi <= asse.a;
  const posizioneOggi = barra(oggi, oggi, asse).left;
  const commesse = [riepilogo.generale, ...riepilogo.figlie].filter(c => filtro === "tutte" || fasiPerCommessa.has(c.id));

  return (
    <section aria-labelledby="cronoprogramma-operazione" className="min-w-0 rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div>
          <h3 id="cronoprogramma-operazione" className="flex items-center gap-2 font-semibold">
            <CalendarRange className="size-4 text-primary" aria-hidden="true" /> Cronoprogramma dell’operazione
          </h3>
          {fasi.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{dataBreve(asse.da)} – {dataBreve(asse.a)}</p>}
        </div>
        {fasi.length > 0 && <div className="flex flex-wrap items-center gap-2">
          <UniformSelect aria-label="Filtra le fasi del cronoprogramma" className="h-9 rounded-md border px-2 text-sm" value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="tutte">Tutte le fasi</option>
            <option value="ritardi">In ritardo</option>
            <option value="date">Date da verificare</option>
          </UniformSelect>
          <div role="group" aria-label="Periodo del cronoprogramma" className="flex rounded-md border p-0.5">
            <Button size="sm" variant={periodo === "confronto" ? "secondary" : "ghost"} aria-pressed={periodo === "confronto"} onClick={() => setPeriodo("confronto")}>Previsto e reale</Button>
            <Button size="sm" variant={periodo === "previsto" ? "secondary" : "ghost"} aria-pressed={periodo === "previsto"} onClick={() => setPeriodo("previsto")}>Solo previsto</Button>
          </div>
        </div>}
      </header>
      {fasiVisibili.length === 0 ? <p className="border-t p-4 text-sm text-muted-foreground">
        {fasi.length === 0 ? "Scegli una commessa in Lavorazioni per aggiungere le prime fasi." : "Nessuna fase corrisponde al filtro."}
      </p> : <>
        <div role="region" aria-label="Grafico delle fasi per commessa" tabIndex={0} className="overflow-x-auto border-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <div className="min-w-[45rem]">
            <div className="flex border-b bg-muted/40 text-xs text-muted-foreground">
              <div className="sticky left-0 z-10 w-52 shrink-0 border-r bg-card px-3 py-2 font-medium">Commessa e fase</div>
              <div className="relative flex-1">
                {etichette.map(t => <span key={t.data} className="absolute top-2 whitespace-nowrap" style={{ left: `clamp(0px, calc(${t.left}% - 1.25rem), 100% - 2.5rem)` }}>{t.data.slice(5).split("-").reverse().join("/")}</span>)}
              </div>
            </div>
            {commesse.map(c => {
              const gruppo = fasiPerCommessa.get(c.id) ?? [];
              return <div key={c.id}>
                <div className="border-b bg-muted/40 px-3 py-1.5">
                  <button type="button" className="text-left text-sm font-semibold text-primary hover:underline" onClick={() => onApri(c.id)}>
                    {[c.codice, c.nome].filter(Boolean).join(" · ")}
                  </button>
                  <span className="ml-2 text-xs text-muted-foreground">{gruppo.length === 1 ? "1 fase" : `${gruppo.length} fasi`}</span>
                </div>
                {gruppo.map(f => {
                  const piano = intervalloPrevistoFase(f);
                  const consuntivo = periodo === "confronto" && intervalloRealeFase(f, oggi);
                  const chiusura = periodo === "confronto" && !consuntivo && f.realeFine;
                  const ritardo = periodo === "confronto" && f.stato !== "completata" && ritardoFase(f);
                  const titoloPiano = piano ? `Previsto ${dataBreve(piano[0])} – ${dataBreve(piano[1])}` : "Da pianificare";
                  const titoloReale = consuntivo ? `Reale ${dataBreve(consuntivo[0])} – ${dataBreve(consuntivo[1])}` : chiusura ? `Chiusura ${dataBreve(chiusura)}` : "";
                  return <div key={f.id} className="flex border-b last:border-b-0">
                    <div className="sticky left-0 z-10 flex w-52 shrink-0 items-center justify-between gap-2 border-r bg-card px-3 py-2">
                      <button type="button" onClick={() => onApri(c.id, f.id)} className="min-w-0 break-words text-left text-xs font-medium hover:text-primary hover:underline">{f.nome}</button>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{f.avanzamento}%</span>
                    </div>
                    <div role="img" aria-label={[f.nome, titoloPiano, titoloReale, ritardo && `Ritardo di ${ritardo.giorni} giorni`].filter(Boolean).join(". ")} className="relative min-h-10 flex-1">
                      {etichette.map(t => <span key={t.data} className="absolute inset-y-0 border-l border-border/70" style={{ left: `${t.left}%` }} />)}
                      {oggiVisibile && <span className="absolute inset-y-0 border-l border-dashed border-orange-500" style={{ left: `${posizioneOggi}%` }} title="Oggi" />}
                      {piano && <span title={titoloPiano} style={stileBarra(barra(...piano, asse))} className="absolute top-2 h-2 min-w-px rounded-sm border border-slate-400 bg-slate-100 dark:bg-slate-700" />}
                      {consuntivo && <span title={titoloReale} style={stileBarra(barra(...consuntivo, asse))} className={cn("absolute top-5 h-2 min-w-px rounded-sm", f.stato === "completata" ? "bg-emerald-600" : "bg-blue-600")} />}
                      {chiusura && <span title={titoloReale} className="absolute top-5 size-2 rounded-full bg-emerald-600" style={{ left: stileBarra(barra(chiusura, chiusura, asse)).left }} />}
                      {!piano && !consuntivo && !chiusura && <span className="relative ml-2 mt-2 inline-block rounded bg-card px-1 text-xs text-muted-foreground">{f.dateIncoerenti ? "Date da verificare" : "Da pianificare"}</span>}
                      {ritardo && <span className="absolute right-2 top-1 rounded bg-rose-50 px-1 text-[10px] font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300">+{ritardo.giorni} gg</span>}
                    </div>
                  </div>;
                })}
              </div>;
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm border border-slate-400 bg-slate-100 dark:bg-slate-700" />Previsto</span>
          {periodo === "confronto" && <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-blue-600" />Reale da rapportini e chiusure</span>}
          {oggiVisibile && <span className="flex items-center gap-1.5"><span className="h-2.5 border-l border-dashed border-orange-500" />Oggi</span>}
        </div>
      </>}
    </section>
  );
}

function stileBarra({ left, width }: { left: number; width: number }) {
  return { left: `${left}%`, width: `${width}%` };
}
