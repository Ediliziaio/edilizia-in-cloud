import { Bath, CheckCircle2, Grid3X3, Layers3, ShowerHead, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BathroomRenderConfig } from "@/modules/render-bagno/lib/types";

function pretty(value: string | null | undefined) {
  return value ? value.replace(/_/g, " ") : "non impostato";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function valueFrom(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
  const legacy = asRecord(renderPlan.legacy_config);
  const wallTiles = asRecord(legacy.piastrelle_parete);
  const floor = asRecord(legacy.pavimento);
  const bathtub = asRecord(legacy.vasca);
  const shower = asRecord(legacy.doccia);
  const vanity = asRecord(legacy.vanity);
  const sanitary = asRecord(legacy.sanitari);
  const faucets = asRecord(legacy.rubinetteria);
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
                <SpecRow label="Materiale" value={valueFrom(wallTiles, "effetto") ?? spec.wallTiles.effectId} />
                <SpecRow label="Formato" value={valueFrom(wallTiles, "formato") ?? spec.wallTiles.format} />
                <SpecRow label="Posa" value={valueFrom(wallTiles, "posa") ?? spec.wallTiles.layingPattern} />
                <SpecRow label="Fuga" value={valueFrom(wallTiles, "fuga_colore") ?? spec.wallTiles.groutColor} />
              </div>
            </div>
          ) : null}

          {spec.floor.replace ? (
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="mb-3 flex items-center gap-2">
                <Grid3X3 className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold">Pavimento</p>
              </div>
              <div className="grid gap-2">
                <SpecRow label="Materiale" value={valueFrom(floor, "effetto") ?? spec.floor.effectId} />
                <SpecRow label="Formato" value={valueFrom(floor, "formato") ?? spec.floor.format} />
                <SpecRow label="Posa" value={valueFrom(floor, "posa") ?? spec.floor.layingPattern} />
                <SpecRow label="Fuga" value={valueFrom(floor, "fuga_colore") ?? spec.floor.groutColor} />
              </div>
            </div>
          ) : null}

          {spec.bathtub.replace ? (
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="mb-3 flex items-center gap-2">
                <Bath className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold">Vasca</p>
              </div>
              <div className="grid gap-2">
                <SpecRow label="Tipo" value={valueFrom(bathtub, "tipo") ?? spec.bathtub.bathtubTypeLabel} />
                <SpecRow label="Dimensione" value={valueFrom(bathtub, "dimensione_cm") ?? spec.bathtub.nominalSize} />
                <SpecRow label="Materiale" value={valueFrom(bathtub, "materiale") ?? spec.bathtub.materialDescription} />
                <SpecRow label="Rubinetteria" value={valueFrom(bathtub, "rubinetteria_vasca") ?? spec.bathtub.faucetPosition} />
              </div>
            </div>
          ) : null}

          {spec.shower.replace ? (
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="mb-3 flex items-center gap-2">
                <ShowerHead className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold">Doccia</p>
              </div>
              <div className="grid gap-2">
                <SpecRow label="Tipo" value={valueFrom(shower, "tipo") ?? spec.shower.showerTypeLabel} />
                <SpecRow label="Vetro" value={valueFrom(shower, "box_vetro") ?? spec.shower.glassType} />
                <SpecRow label="Piatto" value={valueFrom(shower, "piatto") ?? spec.shower.trayType} />
                <SpecRow label="Profilo" value={valueFrom(shower, "profilo") ?? spec.shower.frameFinish} />
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
                <SpecRow label="Mobile" value={valueFrom(vanity, "stile") ?? spec.vanity.styleLabel} />
                <SpecRow label="Colore" value={valueFrom(vanity, "colore") ?? spec.vanity.colorLabel} />
                <SpecRow label="Top" value={valueFrom(vanity, "piano") ?? spec.vanity.topDescription} />
                <SpecRow label="Specchio" value={valueFrom(vanity, "specchio") ?? spec.vanity.mirrorType} />
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
                {spec.sanitaryWare.replace ? <SpecRow label="WC" value={valueFrom(sanitary, "tipo_wc") ?? spec.sanitaryWare.toiletType} /> : null}
                {spec.sanitaryWare.replace ? <SpecRow label="Piastra WC" value={valueFrom(sanitary, "piastra_wc") ?? spec.sanitaryWare.flushPlateStyle} /> : null}
                {spec.faucets.replace ? <SpecRow label="Finitura rubinetti" value={valueFrom(faucets, "finitura") ?? spec.faucets.finish} /> : null}
                {spec.faucets.replace ? <SpecRow label="Stile rubinetti" value={valueFrom(faucets, "stile") ?? spec.faucets.style} /> : null}
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
