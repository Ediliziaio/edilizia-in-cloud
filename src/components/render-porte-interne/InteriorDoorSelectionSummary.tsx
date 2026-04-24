import { CheckCircle2, DoorOpen, Frame, GlassWater, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InteriorDoorRenderConfig } from "@/modules/render-porte-interne/lib/types";

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

export function InteriorDoorSelectionSummary({ renderPlan }: { renderPlan: InteriorDoorRenderConfig }) {
  const spec = renderPlan.technical_specification;
  const config = renderPlan.legacy_config;
  const manifest = renderPlan.replacement_manifest;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-cyan-600" />
          Scelte tecniche porta interna
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="capitalize">{pretty(config.door_type)}</Badge>
          <Badge variant="outline" className="capitalize">{pretty(config.context)}</Badge>
          <Badge variant="outline">{manifest.interventions.length} interventi</Badge>
          {renderPlan.photo_meta?.orientation ? (
            <Badge variant="outline" className="capitalize">Foto {renderPlan.photo_meta.orientation}</Badge>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="mb-3 flex items-center gap-2">
              <DoorOpen className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold">Porta e apertura</p>
            </div>
            <div className="grid gap-2">
              <SpecRow label="Tipologia" value={spec.doorTypology} />
              <SpecRow label="Ante" value={spec.leafConfiguration} />
              <SpecRow label="Meccanismo" value={spec.mechanismSpecification} />
              <SpecRow label="Altezza" value={spec.heightSpecification} />
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="mb-3 flex items-center gap-2">
              <Frame className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold">Telaio e raccordi</p>
            </div>
            <div className="grid gap-2">
              <SpecRow label="Telaio" value={spec.frameSpecification} />
              <SpecRow label="Coprifili" value={config.frame.coprifilo ?? "standard"} />
              <SpecRow label="Vano target" value={config.apertura.vano_target} />
              <SpecRow label="Spazio scorrimento" value={config.apertura.spazio_scorrimento_parete} />
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="mb-3 flex items-center gap-2">
              <GlassWater className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold">Finitura e vetro</p>
            </div>
            <div className="grid gap-2">
              <SpecRow label="Finitura" value={spec.finishSpecification} />
              <SpecRow label="Colore" value={config.colore} />
              <SpecRow label="Vetro" value={spec.glassSpecification} />
              <SpecRow label="Privacy" value={config.glass.privacy_level ?? "non previsto"} />
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="mb-3 flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold">Ferramenta e vincoli</p>
            </div>
            <div className="grid gap-2">
              <SpecRow label="Ferramenta" value={spec.hardwareSpecification} />
              <SpecRow label="Finitura" value={config.hardware.finitura} />
              <SpecRow label="Preserva" value={manifest.preserveExactly.slice(0, 2).join(", ")} />
              <SpecRow label="Rimuove" value={manifest.removals.slice(0, 2).join(", ")} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
