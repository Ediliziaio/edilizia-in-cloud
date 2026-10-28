import { useEffect, useId, useRef } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assegnaRuolo, controllaImmagineCatalogo, MAX_IMMAGINI_CATALOGO, RUOLI_IMMAGINE, type BozzaImmagineCatalogo, type RuoloImmagineCatalogo } from "@/lib/listino/immaginiCatalogo";

export function GalleriaImmaginiCatalogo({ value, onChange, disabled = false }: {
  value: BozzaImmagineCatalogo[]; onChange: (next: BozzaImmagineCatalogo[]) => void; disabled?: boolean;
}) {
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const previews = useRef(new Set<string>());
  useEffect(() => () => { for (const url of previews.current) URL.revokeObjectURL(url); previews.current.clear(); }, []);
  const aggiungi = (files: File[]) => {
    if (!files.length) return;
    if (value.length + files.length > MAX_IMMAGINI_CATALOGO) { toast.error(`Al massimo ${MAX_IMMAGINI_CATALOGO} immagini per linea.`); return; }
    const errore = files.map(controllaImmagineCatalogo).find(Boolean);
    if (errore) { toast.error(errore); return; }
    const haPrincipale = value.some(i => i.ruolo === "principale");
    const nuove: BozzaImmagineCatalogo[] = files.map((file, i) => {
      const url = URL.createObjectURL(file); previews.current.add(url);
      return { id: crypto.randomUUID(), file, url, didascalia: "", ruolo: !haPrincipale && i === 0 ? "principale" : "dettaglio" };
    });
    onChange([...value, ...nuove]);
  };
  const sposta = (index: number, offset: number) => {
    const next = [...value];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };
  return <section className="space-y-3" aria-label="Immagini della linea">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-medium">Immagini della linea <span className="text-muted-foreground">{value.length}/{MAX_IMMAGINI_CATALOGO}</span></h3>
      <Button type="button" size="sm" variant="outline" disabled={disabled || value.length >= MAX_IMMAGINI_CATALOGO} onClick={() => input.current?.click()}>
        <ImagePlus className="mr-2 h-4 w-4" />Carica immagini
      </Button>
    </div>
    <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Seleziona immagini della linea"
      disabled={disabled} onChange={e => { aggiungi(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
    {value.length === 0 && <div className="border border-dashed p-5 text-center text-sm text-muted-foreground">Nessuna immagine caricata</div>}
    <div className="grid gap-3 sm:grid-cols-2">
      {value.map((immagine, index) => <div key={immagine.id} className="min-w-0 space-y-2 rounded-md border p-3">
        <div className="aspect-[4/3] overflow-hidden bg-white"><img src={immagine.url} alt={immagine.didascalia || `Immagine ${index + 1} della linea`} className="h-full w-full object-contain" /></div>
        <label htmlFor={`${uid}-ruolo-${immagine.id}`} className="block text-xs text-muted-foreground">Uso nel preventivo</label>
        <select id={`${uid}-ruolo-${immagine.id}`} value={immagine.ruolo} disabled={disabled} className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          onChange={e => onChange(assegnaRuolo(value, immagine.id, e.target.value as RuoloImmagineCatalogo))}>
          {Object.entries(RUOLI_IMMAGINE).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <label htmlFor={`${uid}-testo-${immagine.id}`} className="block text-xs text-muted-foreground">Didascalia</label>
        <Input id={`${uid}-testo-${immagine.id}`} value={immagine.didascalia} maxLength={240} disabled={disabled}
          onChange={e => onChange(value.map(i => i.id === immagine.id ? { ...i, didascalia: e.target.value } : i))} />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{index + 1} di {value.length}</span>
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={disabled || index === 0} aria-label={`Sposta su immagine ${index + 1}`} title="Sposta su" onClick={() => sposta(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={disabled || index === value.length - 1} aria-label={`Sposta giù immagine ${index + 1}`} title="Sposta giù" onClick={() => sposta(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={disabled} aria-label={`Rimuovi immagine ${index + 1}`} title="Rimuovi dalla galleria" onClick={() => {
              if (previews.current.delete(immagine.url)) URL.revokeObjectURL(immagine.url);
              onChange(value.filter(i => i.id !== immagine.id));
            }}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>)}
    </div>
  </section>;
}
