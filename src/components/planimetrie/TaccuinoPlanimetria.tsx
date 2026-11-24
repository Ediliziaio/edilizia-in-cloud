import { FileImage, Mic, MicOff, PenLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ACCETTA_DOCUMENTO_PIANTA } from "@/lib/planimetrie/documentoImmagine";
import type { AmbienteGuida } from "@/lib/planimetrie/avvioGuidato";
import { RiepilogoAmbienti } from "./ChatAvvioPlanimetria";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function TaccuinoPlanimetria({ testo, ambienti, foto, puoDettare, dettando, anteprima, nomeFile, pagina, pagine, onTesto, onDetta, onFoto, onTogliFoto, onFile, onDisegna, onTogliSchizzo, onIngrandisci, onPagina }: {
  testo: string;
  ambienti: AmbienteGuida[];
  foto: File[];
  puoDettare: boolean;
  dettando: boolean;
  anteprima: string | null;
  nomeFile: string;
  pagina: number;
  pagine: number;
  onTesto: (testo: string) => void;
  onDetta: () => void;
  onFoto: (files: File[]) => void;
  onTogliFoto: (indice: number) => void;
  onFile: (file: File) => void;
  onDisegna: () => void;
  onTogliSchizzo: () => void;
  onIngrandisci: () => void;
  onPagina: (delta: number) => void;
}) {
  const t = useT();
  return <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div className="min-w-0 space-y-4">
      <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="appunti-sopralluogo" className="text-sm font-semibold">{t("Le misure, stanza per stanza")}</Label>
          {puoDettare && <Button type="button" size="sm" variant={dettando ? "default" : "outline"} onClick={onDetta} aria-pressed={dettando}>
            {dettando ? <MicOff className="mr-1.5 h-4 w-4" /> : <Mic className="mr-1.5 h-4 w-4" />}{dettando ? t("Ferma la dettatura") : t("Detta")}
          </Button>}
        </div>
        <Textarea id="appunti-sopralluogo" rows={6} value={testo} onChange={(e) => onTesto(e.target.value)} maxLength={6000}
          placeholder={"Piano terra\nIngresso 1,50 × 2 m\nCucina 12 m²\nAltezza 2,85 m\n\nPrimo piano\nBagno 2,10 × 2,40 m"} />
        <p className={cn("text-xs text-muted-foreground", dettando && "font-medium text-primary")} role={dettando ? "status" : undefined}>
          {dettando ? t("Dettatura in corso. Leggi una stanza per volta.") : t("Scrivi una stanza per riga. Puoi aggiungere appunti su porte, finestre e collegamenti.")}
        </p>
      </section>
      <section className="space-y-2 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2"><Label htmlFor="foto-sopralluogo" className="text-sm font-semibold">{t("Foto delle stanze")}</Label><span className="text-xs text-muted-foreground">{foto.length} / 6</span></div>
        <Input id="foto-sopralluogo" type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif" multiple capture="environment" disabled={foto.length >= 6}
          onChange={(e) => { onFoto([...(e.target.files ?? [])]); e.target.value = ""; }} />
        {foto.length > 0 && <ul className="flex flex-wrap gap-2" aria-label={t("Foto allegate")}>{foto.map((f, i) => <li key={`${f.name}-${i}`} className="flex max-w-full items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs">
          <span className="min-w-0 truncate">{f.name}</span><Button type="button" size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => onTogliFoto(i)} aria-label={t("Togli foto {name}", { name: String(f.name ?? "") })}><X className="h-3.5 w-3.5" /></Button>
        </li>)}</ul>}
      </section>
    </div>
    <div className="min-w-0 space-y-4">
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileImage className="h-4 w-4" aria-hidden="true" /></span>
          <h2 className="text-sm font-semibold">{t("Schizzo del sopralluogo")}</h2>
        </div>
        {anteprima && <div className="space-y-2">
          <button type="button" aria-label={t("Ingrandisci lo schizzo")} onClick={onIngrandisci} className="grid h-40 w-full place-items-center overflow-hidden rounded-lg border bg-white">
            <img src={anteprima} className="max-h-40 max-w-full object-contain" alt={t("Anteprima dello schizzo")} />
          </button>
          <p className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground" title={nomeFile}>{nomeFile}</p>
          {pagine > 1 && <div className="flex items-center justify-center gap-2 text-xs">
            <Button type="button" size="sm" variant="ghost" disabled={pagina <= 1} aria-label={t("Pagina precedente dello schizzo")} onClick={() => onPagina(-1)}>‹</Button>
            <span>{t("Pagina {pagina} di {pagine}", { pagina: String(pagina ?? ""), pagine: String(pagine ?? "") })}</span>
            <Button type="button" size="sm" variant="ghost" disabled={pagina >= pagine} aria-label={t("Pagina successiva dello schizzo")} onClick={() => onPagina(1)}>›</Button>
          </div>}
        </div>}
        {!anteprima && <p className="text-xs leading-relaxed text-muted-foreground">{t("Disegna qui oppure carica la foto o il PDF del foglio che hai usato sul posto.")}</p>}
        <Button type="button" size="sm" variant="outline" className="w-full justify-center gap-2" onClick={onDisegna}><PenLine className="h-4 w-4" />{t("Disegna uno schizzo")}</Button>
        <Label htmlFor="schizzo-sopralluogo" className="sr-only">{t("Carica lo schizzo del sopralluogo")}</Label>
        <Input id="schizzo-sopralluogo" type="file" accept={ACCETTA_DOCUMENTO_PIANTA} className="h-9 w-full text-xs"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) onFile(file); e.target.value = ""; }} />
        {nomeFile && <Button type="button" size="sm" variant="ghost" className="h-7 px-0 text-xs" onClick={onTogliSchizzo}>{t("Rimuovi schizzo")}</Button>}
      </section>
      <RiepilogoAmbienti ambienti={ambienti} vuoto={t("Le misure che scrivi o detti compaiono qui.")} />
    </div>
  </div>;
}
