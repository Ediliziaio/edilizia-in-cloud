import { useMemo, useState } from "react";
import { Calculator, ChevronDown, ChevronRight, ChevronsDown, ChevronsUp, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcolaVoce, type VoceEditor } from "@/lib/computo/editorNativo";
import { formatEuro } from "@/lib/computo/computoStrutturato";

const capitoliFrequenti = ["Demolizioni e rimozioni", "Opere murarie", "Impianti elettrici", "Impianti idraulici", "Pavimenti e rivestimenti", "Serramenti", "Tinteggiature", "Sicurezza"];

export default function ComputoCapitoli({ voci, capitoliVuoti, scelta, onSelect, onAdd, onCapitoli, onRename, onListino }: {
  voci: VoceEditor[]; capitoliVuoti: string[]; scelta?: string; onSelect: (id: string) => void;
  onAdd: (capitolo: string) => void; onCapitoli: (nomi: string[]) => void;
  onRename: (prima: string, dopo: string) => void; onListino?: (capitolo?: string) => void;
}) {
  const [ricerca, setRicerca] = useState("");
  const [chiusi, setChiusi] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<{ originale?: string } | null>(null);
  const [nome, setNome] = useState("");
  const [errore, setErrore] = useState("");
  const capitoli = useMemo(() => {
    const gruppi = new Map<string, { voce: VoceEditor; indice: number; calcolo: ReturnType<typeof calcolaVoce> }[]>();
    voci.forEach((voce, indice) => {
      const nome = voce.capitolo.trim() || "Opere edili";
      if (!gruppi.has(nome)) gruppi.set(nome, []);
      gruppi.get(nome)!.push({ voce, indice, calcolo: calcolaVoce(voce) });
    });
    for (const nome of capitoliVuoti) if (!gruppi.has(nome)) gruppi.set(nome, []);
    return [...gruppi].map(([nome, righe]) => ({ nome, righe }));
  }, [voci, capitoliVuoti]);
  const apri = (originale?: string) => { setNome(originale ?? ""); setErrore(""); setDialog({ originale }); };
  const salvaNome = () => {
    const prossimo = nome.trim();
    if (!prossimo) { setErrore("Inserisci il nome del capitolo."); return; }
    if (capitoli.some(c => c.nome.toLocaleLowerCase("it") === prossimo.toLocaleLowerCase("it") && c.nome !== dialog?.originale)) { setErrore("Questo capitolo esiste già. Scegli un nome diverso."); return; }
    if (dialog?.originale) onRename(dialog.originale, prossimo);
    else onCapitoli([...capitoliVuoti, prossimo]);
    setRicerca(""); setChiusi(prev => { const next = new Set(prev); next.delete(prossimo); return next; });
    setDialog(null);
  };
  const filtro = ricerca.trim().toLocaleLowerCase("it");
  const visibili = capitoli.map((c, indice) => ({ ...c, numero: indice + 1, righeVisibili: c.nome.toLocaleLowerCase("it").includes(filtro) ? c.righe : c.righe.filter(r => `${r.voce.descrizione} ${r.voce.tariffa}`.toLocaleLowerCase("it").includes(filtro)) }))
    .filter(c => !filtro || c.righeVisibili.length || c.nome.toLocaleLowerCase("it").includes(filtro));
  return <section aria-label="Capitoli del computo" className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><Calculator className="h-4 w-4 text-orange-600" /><h3 className="text-sm font-semibold">Computo metrico</h3><span className="text-xs text-muted-foreground">{capitoli.length} capitoli</span></div>
      <div className="flex flex-wrap gap-2">
        {!!capitoli.length && <Button variant="outline" size="icon" className="h-9 w-9" title={chiusi.size ? "Espandi tutti i capitoli" : "Comprimi tutti i capitoli"} aria-label={chiusi.size ? "Espandi tutti i capitoli" : "Comprimi tutti i capitoli"} onClick={() => setChiusi(chiusi.size ? new Set() : new Set(capitoli.map(c => c.nome)))}>{chiusi.size ? <ChevronsDown className="h-4 w-4" /> : <ChevronsUp className="h-4 w-4" />}</Button>}
        <Button variant="outline" size="sm" disabled={capitoli.length >= 200} onClick={() => apri()}><Plus className="mr-1 h-4 w-4" />Aggiungi capitolo</Button>
        <Select value="" disabled={capitoli.length >= 200} onValueChange={value => {
          if (!value || capitoli.some(c => c.nome.toLocaleLowerCase("it") === value.toLocaleLowerCase("it"))) return;
          onCapitoli([...capitoliVuoti, value]); setRicerca(""); setChiusi(prev => { const next = new Set(prev); next.delete(value); return next; });
        }}><SelectTrigger aria-label="Capitoli frequenti" className="h-9 w-44"><SelectValue placeholder="Capitolo rapido" /></SelectTrigger><SelectContent>
          {capitoliFrequenti.map(n => <SelectItem key={n} value={n} disabled={capitoli.some(c => c.nome.toLocaleLowerCase("it") === n.toLocaleLowerCase("it"))}>{n}</SelectItem>)}
        </SelectContent></Select>
        {onListino && <Button variant="outline" size="sm" onClick={() => onListino()}><Search className="mr-1 h-4 w-4" />Cerca nei listini</Button>}</div>
    </div>
    {!!capitoli.length && <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Cerca lavorazioni" placeholder="Cerca un capitolo, una lavorazione o un codice" className="pl-9" value={ricerca} onChange={e => setRicerca(e.target.value)} /></div>}
    {!capitoli.length && <div className="flex min-h-60 flex-col items-center justify-center gap-4 rounded-lg border border-dashed bg-white p-6 text-center">
      <Calculator className="h-8 w-8 text-orange-500" /><h3 className="font-semibold">Costruisci il computo</h3>
      <div className="flex flex-wrap justify-center gap-2"><Button onClick={() => apri()}><Plus className="mr-1 h-4 w-4" />Crea il primo capitolo</Button><Button variant="outline" onClick={() => onListino ? onListino() : onAdd("Opere edili")}>Aggiungi lavorazione</Button></div>
    </div>}
    <div aria-label="Elenco dei capitoli" role="region" tabIndex={voci.length > 6 ? 0 : undefined} className={`space-y-3 ${voci.length > 6 ? "max-h-[480px] overflow-y-auto overscroll-contain pr-1" : ""}`}>
    {visibili.map(c => {
      const aperto = !!filtro || !chiusi.has(c.nome);
      const parziale = c.righe.some(r => r.calcolo.errori.length);
      const totale = c.righe.reduce((s, r) => s + (r.calcolo.errori.length ? 0 : r.calcolo.importo ?? 0), 0);
      return <div key={c.nome} className="overflow-hidden rounded-lg border bg-white">
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`${aperto ? "Chiudi" : "Apri"} capitolo ${c.nome}`} aria-expanded={aperto} onClick={() => setChiusi(prev => { const next = new Set(prev); if (next.has(c.nome)) next.delete(c.nome); else next.add(c.nome); return next; })}>{aperto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Button>
          <span className="text-xs font-semibold text-orange-600">{String(c.numero).padStart(2, "0")}</span><h4 className="min-w-0 flex-1 break-words text-sm font-semibold">{c.nome}</h4>
          {!!c.righe.length && <div className="shrink-0 text-right text-sm tabular-nums"><strong>{formatEuro(totale)} €</strong>{parziale && <span className="block text-[11px] text-amber-700">Parziale</span>}</div>}
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Rinomina capitolo" aria-label={`Rinomina capitolo ${c.nome}`} onClick={() => apri(c.nome)}><Pencil className="h-3.5 w-3.5" /></Button>
        </div>
        {aperto && <div>
          {!!c.righeVisibili.length && <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_75px_85px_110px] gap-3 border-t px-4 py-2 text-xs text-muted-foreground sm:grid"><span>Lavorazione</span><span className="text-right">Quantità</span><span className="text-right">Prezzo unitario</span><span className="text-right">Importo</span></div>}
          {c.righeVisibili.map(({ voce, indice, calcolo }) => <button key={voce.id} type="button" aria-pressed={scelta === voce.id} onClick={() => onSelect(voce.id)} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-t px-4 py-3 text-left transition-colors hover:bg-orange-50/40 sm:grid-cols-[minmax(0,1fr)_75px_85px_110px] ${scelta === voce.id ? "bg-orange-50 shadow-[inset_3px_0_0_#f97316]" : ""}`}>
            <span className="min-w-0"><span className="block text-xs text-muted-foreground">{indice + 1}{voce.tariffa && ` / ${voce.tariffa}`}</span><span className="block break-words text-sm font-medium">{voce.descrizione.slice(0, 180) || "Nuova lavorazione"}</span>
              <span className="mt-1 block text-xs text-muted-foreground sm:hidden">{calcolo.quantita == null ? "Quantità da definire" : `${calcolo.quantita.toLocaleString("it-IT", { maximumFractionDigits: 6 })} ${voce.unita}`}{calcolo.prezzo != null && ` × ${formatEuro(calcolo.prezzo)} €`}</span></span>
            <span className="hidden self-center break-words text-right text-xs tabular-nums sm:block">{calcolo.quantita == null ? "-" : calcolo.quantita.toLocaleString("it-IT", { maximumFractionDigits: 6 })} {voce.unita}</span>
            <span className="hidden self-center break-words text-right text-xs tabular-nums sm:block">{calcolo.prezzo == null ? "-" : `${formatEuro(calcolo.prezzo)} €`}</span>
            <span className={`self-center text-right text-sm font-semibold tabular-nums ${calcolo.errori.length ? "text-amber-700" : ""}`}>{calcolo.errori.length ? "Da completare" : `${formatEuro(calcolo.importo ?? 0)} €`}</span>
          </button>)}
          <div className="flex flex-wrap gap-2 border-t px-3 py-2"><Button variant="ghost" size="sm" disabled={voci.length >= 5000} onClick={() => { setRicerca(""); onAdd(c.nome); }}><Plus className="mr-1 h-4 w-4" />Voce libera</Button>{onListino && <Button variant="ghost" size="sm" onClick={() => { setRicerca(""); onListino(c.nome); }}><Search className="mr-1 h-4 w-4" />Dal listino</Button>}</div>
        </div>}
      </div>;
    })}
    </div>
    {!!capitoli.length && !visibili.length && <p className="py-4 text-sm text-muted-foreground">Nessuna lavorazione trovata.</p>}
    <Dialog open={!!dialog} onOpenChange={open => { if (!open) setDialog(null); }}><DialogContent className="max-w-md" aria-describedby={undefined}><DialogHeader><DialogTitle>{dialog?.originale ? "Rinomina capitolo" : "Nuovo capitolo"}</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); salvaNome(); }} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="computo-capitolo-nome">Nome del capitolo</Label><Input id="computo-capitolo-nome" autoFocus maxLength={300} value={nome} onChange={e => setNome(e.target.value)} placeholder="Es. Demolizioni e rimozioni" /></div>{errore && <p role="alert" className="text-sm text-red-700">{errore}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialog(null)}>Annulla</Button><Button type="submit">{dialog?.originale ? "Salva nome" : "Crea capitolo"}</Button></div></form>
    </DialogContent></Dialog>
  </section>;
}
