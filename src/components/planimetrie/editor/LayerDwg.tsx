import { useId, useMemo, useState } from "react";
import { Eye, EyeOff, Layers, LockKeyhole, UnlockKeyhole } from "lucide-react";
import { gunzipSync, strFromU8 } from "fflate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Ricalco } from "../../../../shared/planimetrie/modello.ts";
import { segmentiDaTracciato } from "./stanzaDaMuri";
import type { Punto } from "../../../../shared/planimetrie/modello.ts";
import { LIMITE_TRACCIATO_DWG_DECOMPRESSO, tracciatoSvgDwg, type TavolaDwg } from "../../../../shared/planimetrie/tavolaDwg.ts";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export interface VistaLayerDwg {
  mostra: boolean;
  nascosti: ReadonlySet<string>;
  isola: string | null;
}

export const vistaLayerDwgIniziale: VistaLayerDwg = { mostra: true, nascosti: new Set(), isola: null };

export function layerVisibile(vista: VistaLayerDwg, nome: string): boolean {
  return vista.mostra && (vista.isola ? vista.isola === nome : !vista.nascosti.has(nome));
}

export function decodificaTracciatoDwg(dato: string): string {
  if (!dato.startsWith("gz:")) return dato;
  try {
    const bytes = Uint8Array.from(atob(dato.slice(3)), c => c.charCodeAt(0));
    if (bytes.length < 18) return "";
    const dimensione = new DataView(bytes.buffer).getUint32(bytes.length - 4, true);
    if (!dimensione || dimensione > LIMITE_TRACCIATO_DWG_DECOMPRESSO) return "";
    const d = strFromU8(gunzipSync(bytes, { out: new Uint8Array(dimensione) }));
    return tracciatoSvgDwg(d) ? d : "";
  } catch { return ""; }
}

/** Layer della tavola che non fanno da bordo a una stanza: quote, testi, arredi, campiture. */
const NON_BORDI = /quot|dim|test|scritt|arred|mobil|hatch|campit|retin|tratteg|simbol|sanitar|alber|verde|assi|axis/i;

/**
 * I tratti della tavola DWG nel sistema dell'editor (stessa trasformazione di DisegnoLayerDwg),
 * per chiudere le stanze con «Stanza dai muri» dove il convertitore non ha ricavato le pareti.
 */
export function segmentiTavolaDwg(tavola: TavolaDwg, ricalco: Ricalco | null): Array<[Punto, Punto]> {
  const r = tavola.riquadro;
  const s = ricalco ? ricalco.larghezzaCm / r.larghezza : 1;
  const x = ricalco ? ricalco.x - r.x * s : 0;
  const y = ricalco ? -ricalco.y + (r.y + r.altezza) * s : 0;
  const inEditor = (p: Punto): Punto => ({ x: x + p.x * s, y: y - p.y * s });
  return tavola.layer.filter((l) => !NON_BORDI.test(l.nome) && l.linee)
    .flatMap((l) => segmentiDaTracciato(decodificaTracciatoDwg(l.linee)))
    .filter(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y) >= 5)
    .map(([a, b]) => [inEditor(a), inEditor(b)]);
}

export function LayerDwg({ tavola, vista, bloccata, onVista, onBlocca }: {
  tavola?: TavolaDwg;
  vista: VistaLayerDwg;
  bloccata: boolean;
  onVista: (vista: VistaLayerDwg) => void;
  onBlocca?: () => void;
}) {
  const t = useT();
  const [filtro, setFiltro] = useState("");
  const layers = tavola?.layer.filter(l => l.nome.toLocaleLowerCase("it").includes(filtro.trim().toLocaleLowerCase("it"))) ?? [];
  const visibili = tavola?.layer.filter(l => layerVisibile(vista, l.nome)).length ?? 0;
  const cambiaLayer = (nome: string) => {
    const nascosti = new Set(vista.nascosti);
    if (!nascosti.delete(nome)) nascosti.add(nome);
    onVista({ mostra: true, isola: null, nascosti });
  };
  const Blocco = bloccata ? LockKeyhole : UnlockKeyhole;

  return <Popover>
    <PopoverTrigger asChild>
      <Button type="button" size="sm" variant={vista.isola ? "secondary" : "outline"} title={bloccata ? t("Originale DWG bloccato") : t("Originale DWG sbloccato")}>
        <Layers /> {t("Layer DWG")} <Blocco className="size-3 text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-[min(23rem,calc(100vw-2rem))] space-y-3" align="start" aria-label={t("Layer DWG")}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{t("Originale DWG")}</p>
          <p className="text-xs text-muted-foreground">{tavola ? t("{visibili} di {n} layer visibili", { visibili: String(visibili ?? ""), n: tavola.layer.length }) : t("Tavola raster")}</p>
        </div>
        {onBlocca ? <Button size="sm" type="button" variant="outline" onClick={onBlocca} aria-pressed={bloccata} aria-label={t("Blocca originale")}>
          <Blocco /> {bloccata ? t("Bloccato") : t("Blocca")}
        </Button> : <span className="flex items-center gap-1 text-xs text-muted-foreground"><Blocco className="size-3.5" /> {t("Bloccato")}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => onVista({ ...vista, mostra: !vista.mostra })}>
          {vista.mostra ? <EyeOff /> : <Eye />}{vista.mostra ? t("Nascondi originale") : t("Mostra originale")}
        </Button>
        {tavola && <Button type="button" variant="ghost" size="sm" onClick={() => onVista(vistaLayerDwgIniziale)}>{t("Mostra tutti")}</Button>}
        {vista.isola && <Button type="button" variant="ghost" size="sm" onClick={() => onVista({ ...vista, isola: null })}>{t("Esci da Isola")}</Button>}
      </div>
      {tavola ? <>
        <Input className="h-8" aria-label={t("Cerca un layer")} placeholder={t("Cerca un layer…")} value={filtro} onChange={e => setFiltro(e.target.value)} />
        <ul className="max-h-64 divide-y overflow-y-auto overscroll-contain rounded-md border">
          {layers.map(l => {
            const visibile = layerVisibile(vista, l.nome);
            return <li key={l.nome} className="flex items-center gap-1 px-1.5 py-1">
              <Button size="icon" type="button" variant="ghost" className="size-8 shrink-0" aria-label={t("Mostra layer {nome}", { nome: String(l.nome ?? "") })}
                title={visibile ? t("Nascondi layer") : t("Mostra layer")} aria-pressed={visibile} disabled={!!vista.isola} onClick={() => cambiaLayer(l.nome)}>
                {visibile ? <Eye /> : <EyeOff className="text-muted-foreground" />}
              </Button>
              <span className="min-w-0 flex-1 truncate text-sm" title={l.nome}>{l.nome}</span>
              <Button size="sm" type="button" variant={vista.isola === l.nome ? "secondary" : "ghost"} className="h-8 shrink-0" aria-label={t("Isola layer {nome}", { nome: String(l.nome ?? "") })}
                aria-pressed={vista.isola === l.nome} onClick={() => onVista({ ...vista, mostra: true, isola: vista.isola === l.nome ? null : l.nome })}>{t("Isola")}</Button>
            </li>;
          })}
          {!layers.length && <li className="p-3 text-xs text-muted-foreground">{t("Nessun layer corrispondente.")}</li>}
        </ul>
      </> : <p className="text-xs text-muted-foreground">{t("Per separare i layer, importa la tavola dal DWG originale.")}</p>}
    </PopoverContent>
  </Popover>;
}

export function DisegnoLayerDwg({ tavola, vista, ricalco }: { tavola: TavolaDwg; vista: VistaLayerDwg; ricalco: Ricalco | null }) {
  const t = useT();
  const clip = useId();
  const layer = useMemo(() => tavola.layer.map(l => ({ ...l, linee: decodificaTracciatoDwg(l.linee), campiture: decodificaTracciatoDwg(l.campiture) })), [tavola.layer]);
  const r = tavola.riquadro;
  const s = ricalco ? ricalco.larghezzaCm / r.larghezza : 1;
  const x = ricalco ? ricalco.x - r.x * s : 0;
  const y = ricalco ? -ricalco.y + (r.y + r.altezza) * s : 0;
  if (!vista.mostra) return null;
  return <g role="img" aria-label={t("Layer originali DWG")} pointerEvents="none" opacity={ricalco?.opacita ?? 0.4}
    transform={`translate(${x} ${y}) scale(${s} ${-s})`}>
    <defs><clipPath id={clip}><rect x={r.x} y={r.y} width={r.larghezza} height={r.altezza} /></clipPath></defs>
    <g clipPath={`url(#${clip})`} strokeLinecap="round" strokeLinejoin="round">
      {layer.filter(l => layerVisibile(vista, l.nome)).map(l => <g key={l.nome} data-layer-dwg={l.nome}>
        {l.linee && <path d={l.linee} stroke="#334155" strokeWidth={0.65} vectorEffect="non-scaling-stroke" fill="none" />}
        {l.campiture && <path d={l.campiture} fill="#334155" fillRule="evenodd" />}
      </g>)}
    </g>
  </g>;
}
