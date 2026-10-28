import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, FileText, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { AllegatoComputo } from "@/lib/computo/editorNativo";
import { caricaAllegatoLocale, leggiAllegatoLocale } from "@/lib/computo/allegatiLocali";

export default function ComputoProgetto({ scope, allegati, onChange, onBusy }: {
  scope: string; allegati: AllegatoComputo[]; onChange: (a: AllegatoComputo[]) => void; onBusy: (busy: boolean) => void;
}) {
  const [tipo, setTipo] = useState<AllegatoComputo["tipo"]>("foto");
  const [busy, setBusy] = useState(false), [errore, setErrore] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const attivo = useRef(true);
  useEffect(() => { attivo.current = true; return () => { attivo.current = false; onBusy(false); }; }, [onBusy]);
  useEffect(() => {
    let disposed = false;
    const locali: Record<string, string> = {};
    void (async () => {
      for (const a of allegati) {
        const blob = await leggiAllegatoLocale(scope, a.id).catch((): null => null);
        if (blob && !disposed) locali[a.id] = URL.createObjectURL(blob);
      }
      if (!disposed) setUrls(locali);
    })();
    return () => { disposed = true; Object.values(locali).forEach(URL.revokeObjectURL); };
  }, [scope, allegati]);
  return <section className="space-y-4" aria-label="Progetto e allegati">
    <h2 className="text-lg font-semibold">Foto e tavole del progetto</h2>
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-full space-y-2 sm:w-52"><Label htmlFor="allegato-tipo">Tipo di allegato</Label>
        <Select value={tipo} disabled={busy} onValueChange={value => setTipo(value as typeof tipo)}>
          <SelectTrigger id="allegato-tipo"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="foto">Foto</SelectItem><SelectItem value="planimetria">Planimetria</SelectItem><SelectItem value="render">Render</SelectItem></SelectContent>
        </Select>
      </div>
      <Button variant="outline" disabled={busy || allegati.length >= 20} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}Carica file
      </Button>
      <span className="pb-2 text-xs text-muted-foreground">{allegati.length}/20 allegati · file in questo browser</span>
    </div>
    <input ref={input} type="file" accept="image/jpeg,image/png,application/pdf" hidden onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
      setBusy(true); onBusy(true); setErrore("");
      try {
        if (allegati.reduce((s, a) => s + a.dimensione, 0) + file.size > 50 * 1024 * 1024) throw new Error("Gli allegati del preventivo superano il limite complessivo di 50 MB.");
        const meta = await caricaAllegatoLocale(scope, file, tipo);
        if (attivo.current) onChange([...allegati, meta]);
      } catch (e) { if (attivo.current) setErrore(e instanceof Error ? e.message : "File non salvato: riprova."); }
      finally { if (attivo.current) { setBusy(false); onBusy(false); } }
    }} />
    {errore && <p role="alert" className="text-sm text-rose-700">{errore}</p>}
    {!allegati.length && <div className="border-y py-10 text-center text-sm text-muted-foreground">Nessun allegato al progetto</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{allegati.map((a, index) => <article key={a.id} className="min-w-0 overflow-hidden rounded-lg border">
      <div className="flex h-40 items-center justify-center bg-slate-50">
        {urls[a.id] && a.mime.startsWith("image/") ? <img src={urls[a.id]} alt={a.nome} className="h-full w-full object-contain" /> : <FileText className="h-10 w-10 text-slate-400" />}
      </div>
      <div className="space-y-2 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words text-sm font-medium">{a.nome}</h3><p className="text-xs capitalize text-muted-foreground">{a.tipo} · {(a.dimensione / 1024 / 1024).toFixed(2)} MB</p></div>
        <Button variant="ghost" size="icon" title="Rimuovi allegato" aria-label={`Rimuovi ${a.nome}`} disabled={busy} onClick={() => onChange(allegati.filter(r => r.id !== a.id))}><Trash2 className="h-4 w-4" /></Button></div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <label className="flex items-center gap-2 text-sm"><Switch aria-label={`Includi ${a.nome} nel PDF`} checked={a.includi} disabled={busy} onCheckedChange={includi => onChange(allegati.map(r => r.id === a.id ? { ...r, includi } : r))} />Includi nel PDF</label>
          <div className="flex gap-1">{([-1, 1] as const).map(delta => <Button key={delta} size="icon" variant="ghost" title={delta < 0 ? "Sposta prima" : "Sposta dopo"} aria-label={`${delta < 0 ? "Anticipa" : "Posticipa"} ${a.nome}`} disabled={busy || index + delta < 0 || index + delta >= allegati.length} onClick={() => {
            const next = [...allegati]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; onChange(next);
          }}>{delta < 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}</Button>)}</div>
        </div>
        {urls[a.id] && <a href={urls[a.id]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary" title="Apri allegato"><ExternalLink className="h-4 w-4" />Apri allegato</a>}
      </div>
    </article>)}</div>
  </section>;
}
