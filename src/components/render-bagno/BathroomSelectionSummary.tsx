import { Bath, CheckCircle2, Grid3X3, Heater, Layers3, Lightbulb, ShowerHead, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BathroomRenderConfig } from "@/modules/render-bagno/lib/types";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

function pretty(value: string | null | undefined) {
  return value ? value.replace(/_/g, " ") : "non impostato";
}

// «Foto landscape» → «Foto orizzontale».
const ORIENTAMENTO_FOTO: Record<string, string> = {
  portrait: "Foto verticale",
  landscape: "Foto orizzontale",
  square: "Foto quadrata",
};

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
  const t = useT();
  return (
    <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2 max-md:min-w-0 max-md:px-2.5 max-md:py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground max-md:text-[11px] max-md:font-medium max-md:normal-case max-md:tracking-normal">{label}</p>
      <p className="mt-0.5 text-sm font-medium capitalize max-md:text-[13px]">{value ? pretty(value) : t("non impostato")}</p>
    </div>
  );
}

export function BathroomSelectionSummary({ renderPlan }: { renderPlan: BathroomRenderConfig }) {
  const t = useT();
  const { technical_specification: spec } = renderPlan;
  const legacy = asRecord(renderPlan.legacy_config);
  const wallTiles = asRecord(legacy.piastrelle_parete);
  const floor = asRecord(legacy.pavimento);
  const bathtub = asRecord(legacy.vasca);
  const shower = asRecord(legacy.doccia);
  const vanity = asRecord(legacy.vanity);
  const sanitary = asRecord(legacy.sanitari);
  const faucets = asRecord(legacy.rubinetteria);
  const towelWarmer = asRecord(legacy.termoarredo);
  const activeSpecs = [
    spec.wallTiles.replace,
    spec.floor.replace,
    spec.bathtub.replace,
    spec.shower.replace,
    spec.vanity.replace,
    spec.sanitaryWare.replace,
    spec.faucets.replace,
    spec.towelWarmer?.replace,
    spec.lighting.replace,
  ].filter(Boolean).length;

  return (
    <Card>
      <CardHeader className="pb-3 max-md:p-3 max-md:pb-2">
        <CardTitle className="flex items-center gap-2 text-sm max-md:text-[13px]">
          <CheckCircle2 className="h-4 w-4 text-cyan-600" />
          {t("Scelte tecniche applicate")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-md:space-y-3 max-md:p-3 max-md:pt-0">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="capitalize">
            {pretty(renderPlan.intervention_type)}
          </Badge>
          <Badge variant="outline">{t("{activeSpecs} gruppi modificati", { activeSpecs })}</Badge>
          {renderPlan.photo_meta?.orientation ? (
            <Badge variant="outline">{ORIENTAMENTO_FOTO[renderPlan.photo_meta.orientation] ? t(ORIENTAMENTO_FOTO[renderPlan.photo_meta.orientation]) : t("Foto {orientamento}", { orientamento: renderPlan.photo_meta.orientation })}</Badge>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {spec.wallTiles.replace ? (
            <div className="rounded-xl border bg-muted/20 p-3 max-md:p-2.5">
              <div className="mb-3 flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold max-md:text-[13px]">{t("Pareti")}</p>
              </div>
              <div className="grid gap-2 max-md:grid-cols-2 max-md:gap-1.5">
                <SpecRow label={t("Materiale")} value={valueFrom(wallTiles, "effetto") ?? spec.wallTiles.effectId} />
                <SpecRow label={t("Formato")} value={valueFrom(wallTiles, "formato") ?? spec.wallTiles.format} />
                <SpecRow label={t("Posa")} value={valueFrom(wallTiles, "posa") ?? spec.wallTiles.layingPattern} />
                <SpecRow label={t("Fuga")} value={valueFrom(wallTiles, "fuga_colore") ?? spec.wallTiles.groutColor} />
              </div>
            </div>
          ) : null}

          {spec.floor.replace ? (
            <div className="rounded-xl border bg-muted/20 p-3 max-md:p-2.5">
              <div className="mb-3 flex items-center gap-2">
                <Grid3X3 className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold max-md:text-[13px]">{t("Pavimento")}</p>
              </div>
              <div className="grid gap-2 max-md:grid-cols-2 max-md:gap-1.5">
                <SpecRow label={t("Materiale")} value={valueFrom(floor, "effetto") ?? spec.floor.effectId} />
                <SpecRow label={t("Formato")} value={valueFrom(floor, "formato") ?? spec.floor.format} />
                <SpecRow label={t("Posa")} value={valueFrom(floor, "posa") ?? spec.floor.layingPattern} />
                <SpecRow label={t("Fuga")} value={valueFrom(floor, "fuga_colore") ?? spec.floor.groutColor} />
              </div>
            </div>
          ) : null}

          {spec.bathtub.replace ? (
            <div className="rounded-xl border bg-muted/20 p-3 max-md:p-2.5">
              <div className="mb-3 flex items-center gap-2">
                <Bath className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold max-md:text-[13px]">{t("Vasca")}</p>
              </div>
              <div className="grid gap-2 max-md:grid-cols-2 max-md:gap-1.5">
                <SpecRow label={t("Tipo")} value={valueFrom(bathtub, "tipo") ?? spec.bathtub.bathtubTypeLabel} />
                <SpecRow label={t("Dimensione")} value={valueFrom(bathtub, "dimensione_cm") ?? spec.bathtub.nominalSize} />
                <SpecRow label={t("Materiale")} value={valueFrom(bathtub, "materiale") ?? spec.bathtub.materialDescription} />
                <SpecRow label={t("Rubinetteria")} value={valueFrom(bathtub, "rubinetteria_vasca") ?? spec.bathtub.faucetPosition} />
                {valueFrom(bathtub, "parete_doccia") ? <SpecRow label={t("Parete vetro")} value={valueFrom(bathtub, "parete_doccia")} /> : null}
              </div>
            </div>
          ) : null}

          {spec.shower.replace ? (
            <div className="rounded-xl border bg-muted/20 p-3 max-md:p-2.5">
              <div className="mb-3 flex items-center gap-2">
                <ShowerHead className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold max-md:text-[13px]">{t("Doccia")}</p>
              </div>
              <div className="grid gap-2 max-md:grid-cols-2 max-md:gap-1.5">
                <SpecRow label={t("Tipo")} value={valueFrom(shower, "tipo") ?? spec.shower.showerTypeLabel} />
                <SpecRow label={t("Vetro")} value={valueFrom(shower, "box_vetro") ?? spec.shower.glassType} />
                <SpecRow label={t("Piatto")} value={valueFrom(shower, "piatto") ?? spec.shower.trayType} />
                <SpecRow label={t("Profilo")} value={valueFrom(shower, "profilo") ?? spec.shower.frameFinish} />
                {valueFrom(shower, "nicchia") ? <SpecRow label={t("Nicchia")} value={valueFrom(shower, "nicchia")} /> : null}
                {valueFrom(shower, "scarico") ? <SpecRow label={t("Scarico")} value={valueFrom(shower, "scarico")} /> : null}
              </div>
            </div>
          ) : null}

          {spec.vanity.replace ? (
            <div className="rounded-xl border bg-muted/20 p-3 max-md:p-2.5">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold max-md:text-[13px]">{t("Mobile e specchio")}</p>
              </div>
              <div className="grid gap-2 max-md:grid-cols-2 max-md:gap-1.5">
                <SpecRow label={t("Mobile")} value={valueFrom(vanity, "stile") ?? spec.vanity.styleLabel} />
                <SpecRow label={t("Colore")} value={valueFrom(vanity, "colore") ?? spec.vanity.colorLabel} />
                <SpecRow label={t("Top")} value={valueFrom(vanity, "piano") ?? spec.vanity.topDescription} />
                <SpecRow label={t("Specchio")} value={valueFrom(vanity, "specchio") ?? spec.vanity.mirrorType} />
              </div>
            </div>
          ) : null}

          {spec.towelWarmer?.replace ? (
            <div className="rounded-xl border bg-muted/20 p-3 max-md:p-2.5">
              <div className="mb-3 flex items-center gap-2">
                <Heater className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold max-md:text-[13px]">{t("Termoarredo")}</p>
              </div>
              <div className="grid gap-2 max-md:grid-cols-2 max-md:gap-1.5">
                <SpecRow label={t("Azione")} value={valueFrom(towelWarmer, "azione") ?? spec.towelWarmer.action} />
                {spec.towelWarmer.action !== "rimuovi" ? <SpecRow label={t("Modello")} value={valueFrom(towelWarmer, "tipo")} /> : null}
                {spec.towelWarmer.action !== "rimuovi" ? <SpecRow label={t("Finitura")} value={valueFrom(towelWarmer, "finitura")} /> : null}
              </div>
            </div>
          ) : null}

          {spec.lighting.replace ? (
            <div className="rounded-xl border bg-muted/20 p-3 max-md:p-2.5">
              <div className="mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold max-md:text-[13px]">{t("Illuminazione")}</p>
              </div>
              <div className="grid gap-2 max-md:grid-cols-2 max-md:gap-1.5">
                <SpecRow label={t("Luci")} value={valueFrom(legacy, "illuminazione_tipo")} />
              </div>
            </div>
          ) : null}

          {spec.sanitaryWare.replace || spec.faucets.replace ? (
            <div className="rounded-xl border bg-muted/20 p-3 max-md:p-2.5">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold max-md:text-[13px]">{t("Sanitari e metalli")}</p>
              </div>
              <div className="grid gap-2 max-md:grid-cols-2 max-md:gap-1.5">
                {spec.sanitaryWare.replace ? <SpecRow label="WC" value={valueFrom(sanitary, "tipo_wc") ?? spec.sanitaryWare.toiletType} /> : null}
                {spec.sanitaryWare.replace ? <SpecRow label={t("Piastra WC")} value={valueFrom(sanitary, "piastra_wc") ?? spec.sanitaryWare.flushPlateStyle} /> : null}
                {spec.sanitaryWare.replace ? <SpecRow label={t("Colore piastra")} value={valueFrom(sanitary, "piastra_wc_colore") ?? spec.sanitaryWare.flushPlateColor} /> : null}
                {spec.faucets.replace ? <SpecRow label={t("Finitura rubinetti")} value={valueFrom(faucets, "finitura") ?? spec.faucets.finish} /> : null}
                {spec.faucets.replace ? <SpecRow label={t("Stile rubinetti")} value={valueFrom(faucets, "stile") ?? spec.faucets.style} /> : null}
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
