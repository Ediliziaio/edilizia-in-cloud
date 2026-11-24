import { useId, useRef, useState } from "react";
import { Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Punto } from "./adattatore";
import { leggiCoordinata, scriviMetri } from "./misure";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function CoordinateDisegno({ etichetta, precedente, onApri, onPunto }: {
  etichetta: string;
  precedente: Punto | undefined;
  onApri: () => void;
  onPunto: (p: Punto) => boolean;
}) {
  const t = useT();
  const id = useId();
  const [aperto, setAperto] = useState(false);
  const [relativo, setRelativo] = useState(false);
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [errore, setErrore] = useState(false);
  const inputX = useRef<HTMLInputElement>(null);
  const relativoAttivo = relativo && !!precedente;

  return <Popover open={aperto} onOpenChange={v => {
    setAperto(v);
    if (v) { setErrore(false); onApri(); }
  }}>
    <PopoverTrigger asChild><Button type="button" variant="outline" size="sm"><Crosshair /> {t("Coordinate X/Y")}</Button></PopoverTrigger>
    <PopoverContent align="start" className="w-[min(21rem,calc(100vw-2rem))] space-y-3" aria-label={t("Coordinate X/Y")}>
      <div>
        <p className="text-sm font-semibold">{etichetta}</p>
        <p className="text-xs text-muted-foreground">{t("X verso destra, Y verso l’alto.")}</p>
      </div>
      {precedente && <div role="group" aria-label={t("Riferimento delle coordinate")} className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant={relativoAttivo ? "outline" : "secondary"} aria-pressed={!relativoAttivo} onClick={() => setRelativo(false)}>{t("Assolute")}</Button>
        <Button type="button" size="sm" variant={relativoAttivo ? "secondary" : "outline"} aria-pressed={relativoAttivo} onClick={() => setRelativo(true)}>{t("Da ultimo punto")}</Button>
        <p className="w-full text-xs text-muted-foreground">{t("Ultimo punto · X {x} m · Y {valore} m", { x: String(scriviMetri(precedente.x) ?? ""), valore: String(scriviMetri(-precedente.y) ?? "") })}</p>
      </div>}
      <form className="space-y-2.5" onSubmit={e => {
        e.preventDefault();
        const cx = leggiCoordinata(x), cy = leggiCoordinata(y);
        if (cx === null || cy === null) { setErrore(true); return; }
        setErrore(false);
        if (onPunto({ x: cx + (relativoAttivo ? precedente.x : 0), y: -cy + (relativoAttivo ? precedente.y : 0) })) setAperto(false);
        setX(""); setY(""); inputX.current?.focus();
      }}>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><Label htmlFor={`${id}-x`}>X (m)</Label><Input ref={inputX} id={`${id}-x`} inputMode="decimal" value={x} onChange={e => setX(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor={`${id}-y`}>Y (m)</Label><Input id={`${id}-y`} inputMode="decimal" value={y} onChange={e => setY(e.target.value)} /></div>
        </div>
        {errore && <p role="alert" className="text-xs text-destructive">{t("Inserisci due coordinate valide in metri.")}</p>}
        <Button type="submit" size="sm" className="w-full" disabled={!x.trim() || !y.trim()}>{t("Posa punto")}</Button>
      </form>
    </PopoverContent>
  </Popover>;
}
