import { Crop, FileImage, ScanLine, SquareDashed, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UniformSelect } from "@/components/ui/uniform-select";
import type { LetturaSchizzo, ScalaSchizzo } from "@/lib/planimetrie/schizzoSopralluogo";
import { useBlobRef } from "../useBlobRef";
import { leggiMisura, scriviMetri } from "./misure";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  file: File;
  nome: string;
  primaPagina: boolean;
  ritagliato: boolean;
  raddrizzato: boolean;
  abilitato: boolean;
  occupato: boolean;
  lettura: LetturaSchizzo | null;
  riferimento: ScalaSchizzo | undefined;
  misura: string;
  piuQuote: boolean;
  onPiuQuote: (valore: boolean) => void;
  onRiferimento: (id: string) => void;
  onMisura: (valore: string) => void;
  onLeggi: () => void;
  onCostruisci: () => void;
  onRitaglia: () => void;
  onRaddrizza: () => void;
  onSfondo: () => void;
  onRimuovi: () => void;
}

export function SchizzoChatScheda({ file, nome, primaPagina, ritagliato, raddrizzato, abilitato, occupato, lettura, riferimento, misura,
  piuQuote, onPiuQuote, onRiferimento, onMisura, onLeggi, onCostruisci, onRitaglia, onRaddrizza, onSfondo, onRimuovi }: Props) {
  const t = useT();
  const immagine = useBlobRef<HTMLImageElement>(file, "src");
  const cm = leggiMisura(misura);
  const quoteLette = lettura?.riferimenti.filter(r => r.scritto).length ?? 0;
  return <section aria-label={t("Schizzo allegato")} className="pl-chat-message space-y-3 rounded-xl border bg-background p-3 shadow-sm">
    <div className="flex items-center gap-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileImage className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold" title={nome}>{nome}</p>
        {(primaPagina || ritagliato || raddrizzato) && <p className="text-xs text-muted-foreground">{[primaPagina && t("Prima pagina"), raddrizzato && t("Foto raddrizzata"), ritagliato && t("Ritaglio")].filter(Boolean).join(" · ")}</p>}
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={t("Rimuovi schizzo")} disabled={occupato} onClick={onRimuovi}><X className="h-4 w-4" /></Button>
    </div>
    <div className="max-h-48 overflow-auto rounded-lg border bg-muted/30">
      <div className="relative">
        <img ref={immagine} alt={t("Schizzo di sopralluogo allegato")} className="block h-auto w-full" />
        {lettura && riferimento && <svg viewBox={`0 0 ${lettura.larghezza} ${lettura.altezza}`}
          className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          <line x1={riferimento.da.x} y1={riferimento.da.y} x2={riferimento.a.x} y2={riferimento.a.y}
            stroke="white" strokeWidth={5} vectorEffect="non-scaling-stroke" />
          <line x1={riferimento.da.x} y1={riferimento.da.y} x2={riferimento.a.x} y2={riferimento.a.y}
            stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {[riferimento.da, riferimento.a].map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={lettura.larghezza * .016} fill="#2563eb" stroke="white" vectorEffect="non-scaling-stroke" />)}
        </svg>}
      </div>
    </div>
    <div className="flex flex-wrap gap-1.5">
      <Button type="button" size="sm" variant="outline" disabled={occupato} onClick={onRaddrizza}><SquareDashed className="h-3.5 w-3.5" />{raddrizzato ? t("Rivedi prospettiva") : t("Raddrizza foto")}</Button>
      <Button type="button" size="sm" variant="outline" disabled={occupato} onClick={onRitaglia}><Crop className="h-3.5 w-3.5" />{ritagliato ? t("Modifica ritaglio") : t("Ritaglia")}</Button>
      <Button type="button" size="sm" variant="ghost" disabled={occupato} onClick={onSfondo}>{t("Usa come sfondo")}</Button>
    </div>
    {!abilitato ? <p className="text-xs text-muted-foreground">{t("Per ricostruire lo schizzo, apri un piano vuoto in «Com’è oggi».")}</p> : !lettura ? (
      <Button type="button" size="sm" className="w-full" disabled={occupato} onClick={onLeggi}><ScanLine className="h-4 w-4" /> {t("Leggi lo schizzo")}</Button>
    ) : (
      <div className="space-y-2.5 rounded-lg border border-primary/20 bg-primary/[.04] p-2.5">
        <div>
          <p className="text-xs font-semibold text-foreground">{t("Imposta la scala della bozza")}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t("Controlla sul foglio la distanza evidenziata in blu.")}</p>
        </div>
        {!!lettura.nonRicostruiti?.length && <p role="status" className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          {t("Contorni da completare sulla tavola")} <strong>{lettura.nonRicostruiti.slice(0, 8).join(", ")}</strong>
          {lettura.nonRicostruiti.length > 8 ? ` ${t("e altri")}` : ""}.
        </p>}
        <label className="block space-y-1 text-xs">
          <span>{t("Riferimento sullo schizzo")}</span>
          <UniformSelect aria-label={t("Riferimento sullo schizzo")} className="h-8 w-full bg-background text-xs"
            value={riferimento?.id ?? ""} onChange={e => onRiferimento(e.target.value)} disabled={occupato}>
            {lettura.riferimenti.map(r => <option key={r.id} value={r.id}>{r.nome}{r.scritto ? " · " + scriviMetri(r.scritto.cm) + " m" : ""}</option>)}
          </UniformSelect>
        </label>
        <div className="space-y-1">
          <Label htmlFor="misura-riferimento-schizzo" className="text-xs">{t("Distanza reale di riferimento")}</Label>
          <Input id="misura-riferimento-schizzo" className="h-8 bg-background text-sm" inputMode="decimal" value={misura} maxLength={24}
            placeholder={t("Es. 3,85 m")} onChange={e => onMisura(e.target.value)} disabled={occupato} />
        </div>
        {quoteLette > 1 && <label className="flex items-start gap-2 rounded-md border bg-background p-2.5 text-xs">
          <input type="checkbox" checked={piuQuote} onChange={e => onPiuQuote(e.currentTarget.checked)} disabled={occupato} className="mt-0.5 size-4 shrink-0 accent-primary" />
          <span><span className="block font-medium">{t("Usa più quote ({quoteLette} lette)", { quoteLette: String(quoteLette ?? "") })}</span><span className="mt-0.5 block text-muted-foreground">{t("Le quote concordanti sull’altro asse aiutano a correggere le proporzioni.")}</span></span>
        </label>}
        <Button type="button" size="sm" className="w-full" disabled={occupato || !riferimento || !cm || cm < 50 || cm > 30000}
          onClick={onCostruisci}>{t("Costruisci la pianta")}</Button>
      </div>
    )}
  </section>;
}
