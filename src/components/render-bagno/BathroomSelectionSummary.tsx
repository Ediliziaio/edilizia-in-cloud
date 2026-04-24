import { Bath, CheckCircle2, Grid3X3, Layers3, ShowerHead, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BathroomRenderConfig } from "@/modules/render-bagno/lib/types";

function pretty(value: string | null | undefined) {
  return value ? value.replace(/_/g, " ") : "non impostato";
}

function SpecRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium capitalize">{pretty(value)}</p>
    </div>
  );
}

export function BathroomSelectionSummary({ renderPlan }: { renderPlan: BathroomRenderConfig }) {
  const { technical_specification: spec } = renderPlan;
  const activeSpecs = [
    spec.wallTiles.replace,
    spec.floor.replace,
    spec.bathtub.replace,
    spec.shower.replace,
    spec.vanity.replace,
    spec.sanitaryWare.replace,
    spec.faucets.replace,
  ].filter(Boolean).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-cyan-600" />
          Scelte tecniche applicate
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="capitalize">
            {pretty(renderPlan.intervention_type)}
          </Badge>
          <Badge variant="outline">{activeSpecs} gruppi modificati</Badge>
          {renderPlan.photo_meta?.orientation ? (
            <Badge variant="outline" className="capitalize">Foto {renderPlan.photo_meta.orientation}</Badge>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {spec.wallTiles.replace ? (
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="mb-3 flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold">Pareti</p>
              </div>
              <div className="grid gap-2">
                <SpecRow label="Materiale" value={spec.wallTiles.effectDescription} />
                <SpecRow label="Formato reale" value={`${spec.wallTiles.format} cm`} />
                <SpecRow label="Posa" value={spec.wallTiles.layingPattern} />
                <SpecRow label="Fuga" value={spec.wallTiles.groutColor} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {spec.wallTiles.realScaleLockRule}
              </p>
            </div>
          ) : null}

          {spec.floor.replace ? (
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="mb-3 flex items-center gap-2">
                <Grid3X3 className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold">Pavimento</p>
              </div>
              <div className="grid gap-2">
                <SpecRow label="Materiale" value={spec.floor.effectDescription} />
                <SpecRow label="Formato reale" value={`${spec.floor.format} cm`} />
                <SpecRow label="Posa" value={spec.floor.layingPattern} />
                <SpecRow label="Fuga" value={spec.floor.groutColor} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {spec.floor.realScaleLockRule}
              </p>
            </div>
          ) : null}

          {spec.bathtub.replace ? (
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="mb-3 flex items-center gap-2">
                <Bath className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold">Vasca</p>
              </div>
              <div className="grid gap-2">
                <SpecRow label="Tipo" value={spec.bathtub.bathtubTypeLabel} />
                <SpecRow label="Dimensione" value={spec.bathtub.nominalSize} />
                <SpecRow label="Materiale" value={spec.bathtub.materialDescription} />
                <SpecRow label="Rubinetteria" value={spec.bathtub.faucetPosition} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {spec.bathtub.scaleRule}
              </p>
            </div>
          ) : null}

          {spec.shower.replace ? (
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="mb-3 flex items-center gap-2">
                <ShowerHead className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold">Doccia</p>
              </div>
              <div className="grid gap-2">
                <SpecRow label="Tipo" value={spec.shower.showerTypeLabel} />
                <SpecRow label="Vetro" value={spec.shower.glassType} />
                <SpecRow label="Piatto" value={spec.shower.trayType} />
                <SpecRow label="Profilo" value={spec.shower.frameFinish} />
              </div>
            </div>
          ) : null}

          {spec.vanity.replace ? (
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold">Mobile e specchio</p>
              </div>
              <div className="grid gap-2">
                <SpecRow label="Mobile" value={spec.vanity.styleLabel} />
                <SpecRow label="Colore" value={spec.vanity.colorLabel} />
                <SpecRow label="Top" value={spec.vanity.topDescription} />
                <SpecRow label="Specchio" value={spec.vanity.mirrorType} />
              </div>
            </div>
          ) : null}

          {spec.sanitaryWare.replace || spec.faucets.replace ? (
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold">Sanitari e metalli</p>
              </div>
              <div className="grid gap-2">
                {spec.sanitaryWare.replace ? <SpecRow label="WC" value={spec.sanitaryWare.toiletType} /> : null}
                {spec.sanitaryWare.replace ? <SpecRow label="Piastra WC" value={spec.sanitaryWare.flushPlateStyle} /> : null}
                {spec.faucets.replace ? <SpecRow label="Finitura rubinetti" value={spec.faucets.finish} /> : null}
                {spec.faucets.replace ? <SpecRow label="Stile rubinetti" value={spec.faucets.style} /> : null}
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
