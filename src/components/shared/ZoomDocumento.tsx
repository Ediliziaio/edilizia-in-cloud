import { Maximize, MoveHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

import type { AdattamentoDocumento } from "./zoomDocumentoLayout";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const MIN = 0.5;
const MAX = 3;
const PASSO = 0.25;

export function ZoomDocumento({ zoom, onZoom, adatta, onAdatta, nome = "documento" }: {
  zoom: number;
  onZoom: (valore: number) => void;
  adatta: AdattamentoDocumento;
  onAdatta: (valore: AdattamentoDocumento) => void;
  nome?: string;
}) {
  const t = useT();
  const base = "h-8 w-8 shrink-0";
  return (
    <div role="group" aria-label={t("Zoom e adattamento")} className="inline-flex shrink-0 items-center gap-0.5 rounded-md border bg-background px-0.5">
      <Button type="button" size="icon" variant="ghost" className={base} aria-label={t("Riduci {nome}", { nome: String(nome ?? "") })} title={t("Riduci")}
        disabled={zoom <= MIN} onClick={() => onZoom(Math.max(MIN, zoom - PASSO))}>
        <ZoomOut className="size-4" aria-hidden="true" />
      </Button>
      <output aria-label={t("Zoom relativo alla vista")} className="min-w-9 text-center text-[11px] tabular-nums">
        {Math.round(zoom * 100)}%
      </output>
      <Button type="button" size="icon" variant="ghost" className={base} aria-label={t("Ingrandisci {etichetta}", { etichetta: String(nome ?? "") })} title={t("Ingrandisci")}
        disabled={zoom >= MAX} onClick={() => onZoom(Math.min(MAX, zoom + PASSO))}>
        <ZoomIn className="size-4" aria-hidden="true" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className={base} aria-label={t("Adatta alla pagina")} title={t("Adatta alla pagina")}
        aria-pressed={adatta === "pagina" && zoom === 1} onClick={() => onAdatta("pagina")}>
        <Maximize className="size-4" aria-hidden="true" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className={base} aria-label={t("Adatta alla larghezza")} title={t("Adatta alla larghezza")}
        aria-pressed={adatta === "larghezza" && zoom === 1} onClick={() => onAdatta("larghezza")}>
        <MoveHorizontal className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
