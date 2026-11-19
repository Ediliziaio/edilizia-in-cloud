import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { caricaAssetModello, urlAssetModello, type TipoAssetModello } from "@/lib/computo/assetModello";

export function ComputoAssetUpload({ companyId, tipo, label, valore, onChange, onBusy, disabled }: {
  companyId?: string; tipo: TipoAssetModello; label: string; valore: string;
  onChange: (percorso: string, nome: string) => void; onBusy: (busy: boolean) => void; disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [anteprima, setAnteprima] = useState({ percorso: "", url: "" });
  const url = anteprima.percorso === valore ? anteprima.url : "";
  useEffect(() => {
    let attivo = true;
    if (companyId && valore && tipo !== "font") void urlAssetModello(companyId, valore).then(url => { if (attivo) setAnteprima({ percorso: valore, url }); }).catch((): void => {});
    return () => { attivo = false; };
  }, [companyId, valore, tipo]);
  return <div className="space-y-2 rounded-xl border bg-slate-50/50 p-3">
    <p className="text-xs font-medium">{label}</p>
    {url && <img src={url} alt={label} className={`w-full rounded-md border bg-white ${tipo === "logo" ? "h-20 object-contain p-2" : "aspect-[2/1] object-cover"}`} />}
    <div className="flex flex-wrap items-center gap-2">
      <input ref={input} type="file" accept={tipo === "font" ? ".ttf,font/ttf" : "image/png,image/jpeg"} aria-label={label} className="sr-only" disabled={disabled || busy} onChange={async e => {
        const file = e.currentTarget.files?.[0]; e.currentTarget.value = "";
        if (!file || !companyId) return;
        setBusy(true); onBusy(true);
        try { onChange(await caricaAssetModello(companyId, file, tipo), file.name.replace(/\.ttf$/i, "")); toast.success("File caricato", { description: "Salva il modello per mantenere la modifica." }); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Caricamento non riuscito."); }
        finally { setBusy(false); onBusy(false); }
      }} />
      <Button type="button" size="sm" variant="outline" disabled={disabled || busy || !companyId} onClick={() => input.current?.click()}>{busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : tipo === "font" ? <Upload className="mr-1.5 h-3.5 w-3.5" /> : <ImagePlus className="mr-1.5 h-3.5 w-3.5" />}{valore ? "Sostituisci" : "Carica"} {label.toLowerCase()}</Button>
      {valore && <Button type="button" size="icon" variant="ghost" disabled={disabled || busy} aria-label={`Rimuovi ${label.toLowerCase()}`} onClick={() => onChange("", "")}><Trash2 className="h-4 w-4" /></Button>}
      {valore && tipo === "font" && <span className="text-xs text-emerald-700">TTF caricato</span>}
    </div>
    <p className="text-[11px] leading-relaxed text-muted-foreground">{tipo === "font" ? "TrueType statico (.ttf), massimo 3 MB. Carica solo caratteri che puoi usare nei tuoi documenti." : tipo === "logo" ? "PNG o JPG, massimo 2 MB. Dedicato a questo modello; il marchio aziendale resta disponibile." : "PNG o JPG, massimo 5 MB. L'immagine viene adattata allo spazio della copertina."}</p>
  </div>;
}
