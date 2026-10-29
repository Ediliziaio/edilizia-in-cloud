import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, FileText, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { AllegatoComputo } from "@/lib/computo/editorNativo";
import { caricaAllegatoLocale, leggiAllegatoLocale } from "@/lib/computo/allegatiLocali";

export default function ComputoProgetto({ scope, allegati, onChange, onBusy, fotoCopertina = "", onFotoCopertina }: {
  scope: string; allegati: AllegatoComputo[]; onChange: (a: AllegatoComputo[]) => void; onBusy: (busy: boolean) => void;
  /** La foto che apre la copertina del PDF (id dell'allegato) e chi la cambia. */
  fotoCopertina?: string; onFotoCopertina?: (id: string) => void;
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
  const [sopra, setSopra] = useState(false);
  // Più file insieme, uno alla volta: ognuno si salva prima del successivo, e il primo errore ferma i restanti.
  const carica = async (files: File[]) => {
    if (!files.length || busy) return;
    setBusy(true); onBusy(true); setErrore("");
    let elenco = allegati;
    try {
      for (const file of files) {
        if (elenco.length >= 20) throw new Error("Massimo 20 allegati per preventivo.");
        if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) throw new Error(`«${file.name}»: si caricano solo JPG, PNG e PDF.`);
        if (elenco.reduce((s, a) => s + a.dimensione, 0) + file.size > 50 * 1024 * 1024) throw new Error("Gli allegati del preventivo superano il limite complessivo di 50 MB.");
        const meta = await caricaAllegatoLocale(scope, file, tipo);
        elenco = [...elenco, meta];
        if (attivo.current) onChange(elenco);
      }
    } catch (e) { if (attivo.current) setErrore(e instanceof Error ? e.message : "File non salvato: riprova."); }
    finally { if (attivo.current) { setBusy(false); onBusy(false); } }
  };
  return <section className="space-y-4" aria-label="Progetto e allegati">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><h2 className="text-base font-semibold">Foto e tavole del progetto</h2>
        <p className="text-xs text-muted-foreground">Facoltative · {allegati.length}/20 allegati</p></div>
      <div className="flex w-full items-center gap-2 sm:w-auto"><Label htmlFor="allegato-tipo" className="shrink-0 text-xs text-muted-foreground">I prossimi file sono</Label>
        <Select value={tipo} disabled={busy} onValueChange={value => setTipo(value as typeof tipo)}>
          <SelectTrigger id="allegato-tipo" className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="foto">Foto</SelectItem><SelectItem value="planimetria">Planimetrie</SelectItem><SelectItem value="render">Render</SelectItem></SelectContent>
        </Select>
      </div>
    </div>
    <button type="button" disabled={busy || allegati.length >= 20} onClick={() => input.current?.click()}
      onDragOver={e => { e.preventDefault(); setSopra(true); }} onDragLeave={() => setSopra(false)}
      onDrop={e => { e.preventDefault(); setSopra(false); void carica(Array.from(e.dataTransfer.files)); }}
      className={`flex w-full items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${sopra ? "border-orange-400 bg-orange-50" : "border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50/40"}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50">{busy ? <Loader2 className="h-5 w-5 animate-spin text-orange-500" /> : <ImagePlus className="h-5 w-5 text-orange-500" />}</span>
      <span className="min-w-0"><span className="block text-sm font-medium text-slate-900">{busy ? "Salvo i file…" : "Trascina qui foto, planimetrie o render, o fai clic per sceglierli"}</span>
        <span className="block text-xs text-muted-foreground">JPG, PNG o PDF · fino a 20 file e 50 MB in tutto · quelli con «Includi nel PDF» vanno in fondo al documento</span></span>
    </button>
    <input ref={input} type="file" multiple accept="image/jpeg,image/png,application/pdf" hidden aria-label="Carica file" onChange={e => {
      const files = Array.from(e.target.files ?? []); e.target.value = ""; void carica(files);
    }} />
    {errore && <p role="alert" className="text-sm text-rose-700">{errore}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{allegati.map((a, index) => <article key={a.id} className="min-w-0 overflow-hidden rounded-lg border">
      <div className="flex h-32 items-center justify-center bg-slate-50">
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
        {onFotoCopertina && a.mime.startsWith("image/") && <Button type="button" size="sm" variant={fotoCopertina === a.id ? "default" : "outline"} className="h-7 w-full text-xs" aria-pressed={fotoCopertina === a.id}
          onClick={() => onFotoCopertina(fotoCopertina === a.id ? "" : a.id)}>{fotoCopertina === a.id ? "In copertina · togli" : "Usa in copertina"}</Button>}
        {urls[a.id] && <a href={urls[a.id]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary" title="Apri allegato"><ExternalLink className="h-4 w-4" />Apri allegato</a>}
      </div>
    </article>)}</div>
  </section>;
}
