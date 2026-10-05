import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { DettagliTelefono } from "@/components/render/DettagliTelefono";
import { ReferenceThumb } from "@/components/render/ReferenceThumb";
import {
  Building2,
  Layers,
  Paintbrush,
  Thermometer,
  Columns2,
  Ruler,
  ShieldCheck,
} from "lucide-react";

import type {
  AnalisiFacciata,
  ConfigurazioneFacciata,
  MaterialeDavanzale,
  MaterialeGronde,
  MaterialeZoccolatura,
  TipoInterventoFacciata,
} from "@/modules/render-facciata/lib/types";
import { GUTTER_NATURAL_METALS } from "../../../shared/render-facciata/promptFragments.ts";
// Le stesse foto che il motore allega al render (la miniatura è a colori anche per quelle di forma).
import {
  CLADDING_PATTERN_PHOTOS,
  CLADDING_PHOTOS,
  FACADE_GUTTER_PHOTOS,
  PLASTER_FINISH_PHOTOS,
} from "../../../shared/render-references/facadeReferences.ts";

const INTERVENTION_OPTIONS: { value: TipoInterventoFacciata; label: string; desc: string }[] = [
  { value: "tinteggiatura", label: "Solo tinteggiatura", desc: "Cambiamo colore e finitura superficiale senza inventare nuovi rilievi." },
  { value: "cappotto", label: "Cappotto termico", desc: "Aggiorniamo spessore facciata, imbotti, davanzali e raccordi." },
  { value: "rivestimento", label: "Rivestimento", desc: "Introduciamo materiali di facciata su zone mirate con transizioni pulite." },
  { value: "misto", label: "Intervento misto", desc: "Coordiniamo più strati: intonaco, rivestimento e dettagli." },
  { value: "rifacimento_totale", label: "Rifacimento totale", desc: "Intervento architettonico completo ma fedele all’edificio esistente." },
];

const FINISH_OPTIONS: Array<{ value: ConfigurazioneFacciata["intonaco"]["finitura"]; label: string; desc: string }> = [
  { value: "liscio", label: "Liscio", desc: "Piano e pulito" },
  { value: "graffiato_fine", label: "Graffiato fine", desc: "Texture sottile" },
  { value: "graffiato_medio", label: "Graffiato medio", desc: "Texture più leggibile" },
  { value: "rasato", label: "Rasato", desc: "Extra smooth contemporaneo" },
  { value: "bucciato", label: "Bucciato", desc: "Pelle d’arancia uniforme" },
  { value: "strutturato_grosso", label: "Strutturato grosso", desc: "Granulometria marcata" },
  { value: "rustico", label: "Rustico", desc: "Materico tradizionale" },
  { value: "veneziana", label: "Veneziana", desc: "Lucidata e profonda" },
  { value: "bugnato", label: "Bugnato", desc: "Rilievo geometrico" },
];

const PAINT_ZONES = [
  { value: "tutta", label: "Tutta la facciata" },
  { value: "piano_terra", label: "Solo piano terra" },
  { value: "piani_superiori", label: "Solo piani superiori" },
  { value: "zoccolatura", label: "Solo zoccolatura" },
  { value: "fasce_orizzontali", label: "Fasce orizzontali" },
] satisfies Array<{ value: ConfigurazioneFacciata["intonaco"]["zona"]; label: string }>;

const CLADDING_OPTIONS: Array<{ value: ConfigurazioneFacciata["rivestimento"]["tipo"]; label: string; desc: string }> = [
  { value: "pietra_serena", label: "Pietra Serena", desc: "Grey stone classico" },
  { value: "travertino", label: "Travertino", desc: "Caldo, nobile" },
  { value: "arenaria_beige", label: "Arenaria beige", desc: "Beige naturale" },
  { value: "luserna", label: "Luserna", desc: "Gneiss materico" },
  { value: "marmo_bianco", label: "Marmo bianco", desc: "Pietra chiara premium" },
  { value: "porfido", label: "Porfido", desc: "Texture vulcanica" },
  { value: "splitface_grigio", label: "Splitface grigio", desc: "Rilievo forte" },
  { value: "pietra_rustica", label: "Pietra rustica", desc: "Taglio irregolare" },
  { value: "cotto_rosso", label: "Cotto rosso", desc: "Caldo mediterraneo" },
  { value: "clinker_rosso", label: "Clinker rosso", desc: "Masonry precisa" },
  { value: "clinker_grigio", label: "Clinker grigio", desc: "Look contemporaneo" },
  { value: "clinker_beige", label: "Clinker beige", desc: "Neutro elegante" },
  { value: "cotto_mattone", label: "Cotto mattone", desc: "Mattone caldo" },
  { value: "laterizio_bianco", label: "Laterizio bianco", desc: "Chiaro architettonico" },
];

const CLADDING_ZONES = [
  { value: "tutta", label: "Tutta la facciata" },
  { value: "piano_terra", label: "Solo piano terra" },
  { value: "piani_superiori", label: "Solo piani superiori" },
  { value: "zoccolatura", label: "Solo zoccolatura" },
  { value: "cantonali", label: "Cantonali" },
  { value: "marcapiano", label: "Fasce marcapiano" },
] satisfies Array<{ value: ConfigurazioneFacciata["rivestimento"]["zona"]; label: string }>;

const CLADDING_PATTERNS = [
  { value: "corsi_regolari", label: "Corsi regolari" },
  { value: "corsi_sfalsati", label: "Corsi sfalsati" },
  { value: "listelli_orizzontali", label: "Listelli orizzontali" },
  { value: "opus_incertum", label: "Opus incertum" },
] satisfies Array<{ value: NonNullable<ConfigurazioneFacciata["rivestimento"]["posa"]>; label: string }>;

// Stesse chiavi di GUTTER_MATERIAL_DESCRIPTIONS (prompt) e delle foto di gronde del tetto.
const GUTTER_MATERIALS: Array<{ value: MaterialeGronde; label: string }> = [
  { value: "alluminio", label: "Alluminio preverniciato" },
  { value: "rame", label: "Rame" },
  { value: "zinco_titanio", label: "Zinco-titanio" },
  { value: "acciaio_zincato", label: "Acciaio zincato" },
  { value: "pvc", label: "PVC" },
];

const SILL_MATERIALS: Array<{ value: MaterialeDavanzale; label: string }> = [
  { value: "pietra", label: "Pietra" },
  { value: "marmo", label: "Marmo" },
  { value: "alluminio", label: "Alluminio" },
];

const BASE_COURSE_MATERIALS: Array<{ value: MaterialeZoccolatura; label: string }> = [
  { value: "intonaco", label: "Intonaco" },
  { value: "pietra", label: "Lastre di pietra" },
  { value: "ceramica", label: "Gres / ceramica" },
];

const INSULATION_ZONES = [
  { value: "tutta", label: "Tutta la facciata" },
  { value: "piano_terra", label: "Solo piano terra" },
  { value: "piani_superiori", label: "Solo piani superiori" },
] satisfies Array<{ value: NonNullable<ConfigurazioneFacciata["cappotto"]["zona"]>; label: string }>;

interface FacciataConfigFormProps {
  config: ConfigurazioneFacciata;
  analysis?: AnalisiFacciata | null;
  onChange: (config: ConfigurazioneFacciata) => void;
}

function cardClass(active: boolean) {
  return active
    ? "border-orange-500 bg-orange-50 shadow-sm"
    : "border-slate-300 bg-white shadow-sm hover:border-orange-400 hover:shadow";
}

export function FacciataConfigForm({ config, analysis, onChange }: FacciataConfigFormProps) {
  const update = (partial: Partial<ConfigurazioneFacciata>) => onChange({ ...config, ...partial });
  const setElemento = <K extends keyof ConfigurazioneFacciata["elementi"]>(key: K, value: ConfigurazioneFacciata["elementi"][K]) =>
    update({ elementi: { ...config.elementi, [key]: value } });
  const isMobile = useIsMobile();

  return (
    <div className="space-y-4 max-md:space-y-3">
      {/* Telefono: la lettura dell'edificio è già al passo «Analisi». */}
      {analysis && !isMobile && (
        <Card className="border-orange-200 bg-orange-50/40">
          <CardHeader className="pb-3 max-md:p-3 max-md:pb-2">
            <CardTitle className="text-sm flex items-center gap-2 max-md:text-[13px]">
              <Building2 className="h-4 w-4 text-orange-600" />
              Analisi edificio esistente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{analysis.buildingType}</Badge>
              <Badge variant="secondary">{analysis.buildingStyle}</Badge>
              <Badge variant="secondary">{analysis.floorsCount} piani</Badge>
              <Badge variant="secondary">{analysis.openingsVisible} aperture</Badge>
              <Badge variant="secondary">{analysis.currentCondition}</Badge>
            </div>
            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <div className="rounded-lg border bg-background/70 p-3">
                <p className="uppercase tracking-wide text-[10px]">Finitura attuale</p>
                <p className="mt-1 font-medium text-foreground">{analysis.currentPlasterFinish}</p>
              </div>
              <div className="rounded-lg border bg-background/70 p-3">
                <p className="uppercase tracking-wide text-[10px]">Colore facciata</p>
                <p className="mt-1 font-medium text-foreground">{analysis.currentFacadeColor}</p>
              </div>
              <div className="rounded-lg border bg-background/70 p-3">
                <p className="uppercase tracking-wide text-[10px]">Contesto da preservare</p>
                <p className="mt-1 font-medium text-foreground">{analysis.preservedContext.slice(0, 3).join(", ")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3 max-md:p-3 max-md:pb-2">
          <CardTitle className="text-sm flex items-center gap-2 max-md:text-[13px]">
            <Building2 className="h-4 w-4 text-orange-600" />
            Tipo di intervento
          </CardTitle>
        </CardHeader>
        <CardContent className="max-md:p-3 max-md:pt-0">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 max-sm:grid-cols-2 max-sm:gap-1.5">
            {INTERVENTION_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                className={`rounded-xl border p-4 text-left transition max-md:p-2.5 ${cardClass(config.tipo_intervento === option.value)}`}
                onClick={() => update({ tipo_intervento: option.value })}
              >
                <p className="text-sm font-semibold max-md:text-[13px] max-md:leading-tight">{option.label}</p>
                <p className="mt-1 text-xs text-muted-foreground max-md:hidden">{option.desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 max-md:p-3 max-md:pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm flex items-center gap-2 max-md:text-[13px]">
              <Paintbrush className="h-4 w-4 text-orange-600" />
              Intonaco / tinteggiatura
            </CardTitle>
            <Switch
              checked={config.intonaco.attivo}
              onCheckedChange={(attivo) => update({ intonaco: { ...config.intonaco, attivo } })}
            />
          </div>
        </CardHeader>
        {config.intonaco.attivo && (
          <CardContent className="space-y-4 max-md:space-y-3 max-md:p-3 max-md:pt-0">
            <div className="grid gap-3 md:grid-cols-[180px,1fr,140px] max-md:gap-2">
              <div>
                <Label className="text-xs max-md:text-[11px]">Colore</Label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={config.intonaco.colore_hex}
                    onChange={(e) => update({ intonaco: { ...config.intonaco, colore_hex: e.target.value } })}
                    className="h-10 w-12 cursor-pointer rounded border bg-transparent"
                  />
                  <Input
                    value={config.intonaco.colore_hex}
                    onChange={(e) => update({ intonaco: { ...config.intonaco, colore_hex: e.target.value } })}
                    className="h-10 font-mono text-xs"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs max-md:text-[11px]">Nome / RAL</Label>
                {/* Telefono: nome e RAL affiancati. */}
                <div className="mt-1 grid gap-2 md:grid-cols-2 max-md:grid-cols-2">
                  <Input
                    value={config.intonaco.colore_nome ?? ""}
                    onChange={(e) => update({ intonaco: { ...config.intonaco, colore_nome: e.target.value } })}
                    placeholder="Bianco perla"
                    className="h-10 text-sm"
                  />
                  <Input
                    value={config.intonaco.colore_ral ?? ""}
                    onChange={(e) => update({ intonaco: { ...config.intonaco, colore_ral: e.target.value } })}
                    placeholder="RAL 1013"
                    className="h-10 text-sm"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs max-md:text-[11px]">Zona</Label>
                <Select
                  value={config.intonaco.zona}
                  onValueChange={(value) => update({ intonaco: { ...config.intonaco, zona: value as ConfigurazioneFacciata["intonaco"]["zona"] } })}
                >
                  <SelectTrigger className="mt-1 h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAINT_ZONES.map((zone) => (
                      <SelectItem key={zone.value} value={zone.value}>
                        {zone.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs max-md:text-[11px]">Finitura</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 max-sm:grid-cols-2 max-sm:gap-1.5">
                {FINISH_OPTIONS.map((finish) => (
                  <button
                    type="button"
                    key={finish.value}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition max-md:gap-2 max-md:p-2.5 ${cardClass(config.intonaco.finitura === finish.value)}`}
                    onClick={() => update({ intonaco: { ...config.intonaco, finitura: finish.value } })}
                  >
                    {PLASTER_FINISH_PHOTOS[finish.value] && (
                      <ReferenceThumb
                        photo={PLASTER_FINISH_PHOTOS[finish.value]}
                        alt={`Intonaco ${finish.label.toLowerCase()}`}
                        className="h-12 w-12 shrink-0 rounded-md max-md:h-10 max-md:w-10"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold max-md:text-[13px] max-md:leading-tight">{finish.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground max-md:hidden">{finish.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-3 max-md:p-3 max-md:pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm flex items-center gap-2 max-md:text-[13px]">
              <Layers className="h-4 w-4 text-orange-600" />
              Rivestimenti e zone applicative
            </CardTitle>
            <Switch
              checked={config.rivestimento.attivo}
              onCheckedChange={(attivo) => update({ rivestimento: { ...config.rivestimento, attivo } })}
            />
          </div>
        </CardHeader>
        {config.rivestimento.attivo && (
          <CardContent className="space-y-4 max-md:space-y-3 max-md:p-3 max-md:pt-0">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 max-sm:grid-cols-2 max-sm:gap-1.5">
              {CLADDING_OPTIONS.map((material) => (
                <button
                  type="button"
                  key={material.value}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition max-md:gap-2 max-md:p-2.5 ${cardClass(config.rivestimento.tipo === material.value)}`}
                  onClick={() => update({ rivestimento: { ...config.rivestimento, tipo: material.value } })}
                >
                  {CLADDING_PHOTOS[material.value] && (
                    <ReferenceThumb
                      photo={CLADDING_PHOTOS[material.value]}
                      alt={`Rivestimento ${material.label}`}
                      className="h-12 w-12 shrink-0 rounded-md max-md:h-10 max-md:w-10"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold max-md:text-[13px] max-md:leading-tight">{material.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground max-md:hidden">{material.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-3 max-md:grid-cols-2 max-md:gap-2">
              <div>
                <Label className="text-xs max-md:text-[11px]">Zona applicazione</Label>
                <Select
                  value={config.rivestimento.zona}
                  onValueChange={(value) => update({ rivestimento: { ...config.rivestimento, zona: value as ConfigurazioneFacciata["rivestimento"]["zona"] } })}
                >
                  <SelectTrigger className="mt-1 h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLADDING_ZONES.map((zone) => (
                      <SelectItem key={zone.value} value={zone.value}>
                        {zone.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs max-md:text-[11px]">Posa / composizione</Label>
                {/* La miniatura mostra la posa scelta (una foto dentro le voci finirebbe anche nel campo chiuso). */}
                <div className="mt-1 flex items-center gap-2">
                  {CLADDING_PATTERN_PHOTOS[config.rivestimento.posa ?? "corsi_regolari"] && (
                    <ReferenceThumb
                      photo={CLADDING_PATTERN_PHOTOS[config.rivestimento.posa ?? "corsi_regolari"]}
                      alt={`Posa ${CLADDING_PATTERNS.find((p) => p.value === (config.rivestimento.posa ?? "corsi_regolari"))?.label.toLowerCase() ?? ""}`}
                      className="h-10 w-10 shrink-0 rounded-md"
                    />
                  )}
                  <Select
                    value={config.rivestimento.posa ?? "corsi_regolari"}
                    onValueChange={(value) => update({ rivestimento: { ...config.rivestimento, posa: value as NonNullable<ConfigurazioneFacciata["rivestimento"]["posa"]> } })}
                  >
                    <SelectTrigger className="h-10 min-w-0 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLADDING_PATTERNS.map((pattern) => (
                        <SelectItem key={pattern.value} value={pattern.value}>
                          {pattern.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs max-md:text-[11px]">Colore fuga / giunto</Label>
                <Input
                  value={config.rivestimento.fuga_colore ?? ""}
                  onChange={(e) => update({ rivestimento: { ...config.rivestimento, fuga_colore: e.target.value } })}
                  placeholder="Grigio chiaro"
                  className="mt-1 h-10 text-sm"
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-3 max-md:p-3 max-md:pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm flex items-center gap-2 max-md:text-[13px]">
              <Thermometer className="h-4 w-4 text-orange-600" />
              Cappotto termico
            </CardTitle>
            <Switch
              checked={config.cappotto.attivo}
              onCheckedChange={(attivo) => update({ cappotto: { ...config.cappotto, attivo } })}
            />
          </div>
        </CardHeader>
        {config.cappotto.attivo && (
          <CardContent className="space-y-4 max-md:space-y-3 max-md:p-3 max-md:pt-0">
            <div className="grid gap-3 md:grid-cols-4 max-md:grid-cols-2 max-md:gap-2">
              <div>
                <Label className="text-xs max-md:text-[11px]">Spessore</Label>
                <Select
                  value={String(config.cappotto.spessore_cm)}
                  onValueChange={(value) => update({ cappotto: { ...config.cappotto, spessore_cm: Number(value) as ConfigurazioneFacciata["cappotto"]["spessore_cm"] } })}
                >
                  <SelectTrigger className="mt-1 h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[4, 6, 8, 10, 12, 14].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} cm
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs max-md:text-[11px]">Sistema</Label>
                <Select
                  value={config.cappotto.sistema}
                  onValueChange={(value) => update({ cappotto: { ...config.cappotto, sistema: value as ConfigurazioneFacciata["cappotto"]["sistema"] } })}
                >
                  <SelectTrigger className="mt-1 h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eps">EPS</SelectItem>
                    <SelectItem value="lana_roccia">Lana di roccia</SelectItem>
                    <SelectItem value="fibra_legno">Fibra di legno</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs max-md:text-[11px]">Zona</Label>
                <Select
                  value={config.cappotto.zona ?? "tutta"}
                  onValueChange={(value) => update({ cappotto: { ...config.cappotto, zona: value as NonNullable<ConfigurazioneFacciata["cappotto"]["zona"]> } })}
                >
                  <SelectTrigger className="mt-1 h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INSULATION_ZONES.map((zone) => (
                      <SelectItem key={zone.value} value={zone.value}>
                        {zone.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs max-md:text-[11px]">Colore finitura</Label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={config.cappotto.colore_finitura_hex}
                    onChange={(e) => update({ cappotto: { ...config.cappotto, colore_finitura_hex: e.target.value } })}
                    className="h-10 w-12 cursor-pointer rounded border bg-transparent"
                  />
                  <Input
                    value={config.cappotto.colore_finitura_hex}
                    onChange={(e) => update({ cappotto: { ...config.cappotto, colore_finitura_hex: e.target.value } })}
                    className="h-10 font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Telefono: cornici, davanzali, gronde e ringhiere hanno già «mantieni»:
          stanno in una riga chiusa. */}
      <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <CardHeader className="pb-3 max-md:hidden">
          <CardTitle className="text-sm flex items-center gap-2 max-md:text-[13px]">
            <Columns2 className="h-4 w-4 text-orange-600" />
            Elementi architettonici e dettagli
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-md:p-0">
          <DettagliTelefono titolo="Elementi architettonici e dettagli">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border p-4 space-y-3 max-md:p-3">
              <p className="text-sm font-semibold max-md:text-[13px]">Cornici e marcapiani</p>
              <div className="grid gap-3 sm:grid-cols-2 max-sm:grid-cols-2 max-sm:gap-2">
                <div>
                  <Label className="text-xs max-md:text-[11px]">Cornici finestre</Label>
                  <Select
                    value={config.elementi.cornici_finestre.azione}
                    onValueChange={(value) => setElemento("cornici_finestre", { ...config.elementi.cornici_finestre, azione: value as ConfigurazioneFacciata["elementi"]["cornici_finestre"]["azione"] })}
                  >
                    <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mantieni">Mantieni</SelectItem>
                      <SelectItem value="aggiungi">Aggiungi</SelectItem>
                      <SelectItem value="rimuovi">Rimuovi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs max-md:text-[11px]">Marcapiani</Label>
                  <Select
                    value={config.elementi.marcapiani.azione}
                    onValueChange={(value) => setElemento("marcapiani", { ...config.elementi.marcapiani, azione: value as ConfigurazioneFacciata["elementi"]["marcapiani"]["azione"] })}
                  >
                    <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mantieni">Mantieni</SelectItem>
                      <SelectItem value="aggiungi">Aggiungi</SelectItem>
                      <SelectItem value="rimuovi">Rimuovi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Colori e spessore contano solo per ciò che si aggiunge: con «mantieni» il prompt non li legge. */}
              {(config.elementi.cornici_finestre.azione === "aggiungi" || config.elementi.marcapiani.azione === "aggiungi") && (
                <div className="grid gap-3 sm:grid-cols-2 max-sm:grid-cols-2 max-sm:gap-2">
                  {config.elementi.cornici_finestre.azione === "aggiungi" && (
                    <Input
                      value={config.elementi.cornici_finestre.colore_hex ?? ""}
                      onChange={(e) => setElemento("cornici_finestre", { ...config.elementi.cornici_finestre, colore_hex: e.target.value })}
                      placeholder="Colore cornici (#FFFFFF)"
                      aria-label="Colore cornici"
                      className="h-10 text-sm"
                    />
                  )}
                  {config.elementi.marcapiani.azione === "aggiungi" && (
                    <>
                      <Input
                        value={config.elementi.marcapiani.spessore ?? ""}
                        onChange={(e) => setElemento("marcapiani", { ...config.elementi.marcapiani, spessore: e.target.value })}
                        placeholder="Spessore marcapiani"
                        aria-label="Spessore marcapiani"
                        className="h-10 text-sm"
                      />
                      <Input
                        value={config.elementi.marcapiani.colore_hex ?? ""}
                        onChange={(e) => setElemento("marcapiani", { ...config.elementi.marcapiani, colore_hex: e.target.value })}
                        placeholder="Colore marcapiani"
                        aria-label="Colore marcapiani"
                        className="h-10 text-sm"
                      />
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border p-4 space-y-3 max-md:p-3">
              <p className="text-sm font-semibold max-md:text-[13px]">Davanzali, zoccolatura, gronde</p>
              <div className="grid gap-3 sm:grid-cols-3 max-sm:grid-cols-2 max-sm:gap-2">
                <div>
                  <Label className="text-xs max-md:text-[11px]">Davanzali</Label>
                  <Select
                    value={config.elementi.davanzali.azione}
                    onValueChange={(value) => {
                      const azione = value as ConfigurazioneFacciata["elementi"]["davanzali"]["azione"];
                      // «Sostituisci» senza materiale diceva «stone» nel prompt: la pietra diventa la scelta esplicita.
                      setElemento("davanzali", { ...config.elementi.davanzali, azione, ...(azione === "sostituisci" && !config.elementi.davanzali.materiale ? { materiale: "pietra" as const } : {}) });
                    }}
                  >
                    <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mantieni">Mantieni</SelectItem>
                      <SelectItem value="sostituisci">Sostituisci</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs max-md:text-[11px]">Zoccolatura</Label>
                  <Select
                    value={config.elementi.zoccolatura.azione}
                    onValueChange={(value) => setElemento("zoccolatura", { ...config.elementi.zoccolatura, azione: value as ConfigurazioneFacciata["elementi"]["zoccolatura"]["azione"] })}
                  >
                    <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mantieni">Mantieni</SelectItem>
                      <SelectItem value="aggiungi">Aggiungi</SelectItem>
                      <SelectItem value="rimuovi">Rimuovi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs max-md:text-[11px]">Gronde e pluviali</Label>
                  <Select
                    value={config.elementi.gronde.azione}
                    onValueChange={(value) => {
                      const azione = value as ConfigurazioneFacciata["elementi"]["gronde"]["azione"];
                      // «Sostituisci» senza materiale diceva «alluminio» nel prompt: diventa la scelta esplicita.
                      setElemento("gronde", { ...config.elementi.gronde, azione, ...(azione === "sostituisci" && !config.elementi.gronde.materiale ? { materiale: "alluminio" as const } : {}) });
                    }}
                  >
                    <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mantieni">Mantieni</SelectItem>
                      <SelectItem value="sostituisci">Sostituisci</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {config.elementi.davanzali.azione === "sostituisci" && (
                <div className="grid gap-3 sm:grid-cols-2 max-sm:grid-cols-2 max-sm:gap-2">
                  <div>
                    <Label className="text-xs max-md:text-[11px]">Materiale davanzali</Label>
                    <Select
                      value={config.elementi.davanzali.materiale}
                      onValueChange={(value) => setElemento("davanzali", { ...config.elementi.davanzali, materiale: value as MaterialeDavanzale })}
                    >
                      <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue placeholder="Materiale" /></SelectTrigger>
                      <SelectContent>
                        {SILL_MATERIALS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs max-md:text-[11px]">Colore davanzali</Label>
                    <Input
                      value={config.elementi.davanzali.colore_hex ?? ""}
                      onChange={(e) => setElemento("davanzali", { ...config.elementi.davanzali, colore_hex: e.target.value })}
                      placeholder="Es. bianco Carrara"
                      className="mt-1 h-10 text-sm"
                    />
                  </div>
                </div>
              )}

              {config.elementi.zoccolatura.azione === "aggiungi" && (
                <div className="grid gap-3 sm:grid-cols-3 max-sm:grid-cols-2 max-sm:gap-2">
                  <div>
                    <Label className="text-xs max-md:text-[11px]">Materiale zoccolatura</Label>
                    <Select
                      value={config.elementi.zoccolatura.tipo}
                      onValueChange={(value) => setElemento("zoccolatura", { ...config.elementi.zoccolatura, tipo: value as MaterialeZoccolatura })}
                    >
                      <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue placeholder="Materiale" /></SelectTrigger>
                      <SelectContent>
                        {BASE_COURSE_MATERIALS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs max-md:text-[11px]">Altezza (cm)</Label>
                    <Input
                      value={String(config.elementi.zoccolatura.altezza_cm ?? "")}
                      onChange={(e) => setElemento("zoccolatura", { ...config.elementi.zoccolatura, altezza_cm: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="40"
                      inputMode="numeric"
                      className="mt-1 h-10 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs max-md:text-[11px]">Colore zoccolatura</Label>
                    <Input
                      value={config.elementi.zoccolatura.colore_hex ?? ""}
                      onChange={(e) => setElemento("zoccolatura", { ...config.elementi.zoccolatura, colore_hex: e.target.value })}
                      placeholder="Es. grigio pietra"
                      className="mt-1 h-10 text-sm"
                    />
                  </div>
                </div>
              )}

              {config.elementi.gronde.azione === "sostituisci" && (
                <div className="grid gap-3 sm:grid-cols-2 max-sm:grid-cols-2 max-sm:gap-2">
                  <div>
                    <Label className="text-xs max-md:text-[11px]">Materiale gronde</Label>
                    <div className="mt-1 flex items-center gap-2">
                      {config.elementi.gronde.materiale && FACADE_GUTTER_PHOTOS[config.elementi.gronde.materiale] && (
                        <ReferenceThumb
                          photo={FACADE_GUTTER_PHOTOS[config.elementi.gronde.materiale]}
                          alt={`Gronda in ${GUTTER_MATERIALS.find((m) => m.value === config.elementi.gronde.materiale)?.label.toLowerCase() ?? ""}`}
                          className="h-10 w-10 shrink-0 rounded-md"
                        />
                      )}
                      <Select
                        value={config.elementi.gronde.materiale}
                        onValueChange={(value) => setElemento("gronde", { ...config.elementi.gronde, materiale: value as MaterialeGronde })}
                      >
                        <SelectTrigger className="h-10 min-w-0 text-sm"><SelectValue placeholder="Materiale" /></SelectTrigger>
                        <SelectContent>
                          {GUTTER_MATERIALS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {config.elementi.gronde.materiale && GUTTER_NATURAL_METALS.includes(config.elementi.gronde.materiale) ? (
                    <p className="self-end pb-2 text-xs text-muted-foreground max-md:text-[11px]">Colore naturale del metallo</p>
                  ) : (
                    <div>
                      <Label className="text-xs max-md:text-[11px]">Colore gronde</Label>
                      <Input
                        value={config.elementi.gronde.colore_hex ?? ""}
                        onChange={(e) => setElemento("gronde", { ...config.elementi.gronde, colore_hex: e.target.value })}
                        placeholder="Es. testa di moro"
                        className="mt-1 h-10 text-sm"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border p-4 space-y-3 max-md:p-3">
            <p className="text-sm font-semibold max-md:text-[13px]">Balconi, ringhiere e persiane</p>
            <div className="grid gap-3 sm:grid-cols-[220px,1fr]">
              <div>
                <Label className="text-xs max-md:text-[11px]">Azione ringhiere</Label>
                <Select
                  value={config.elementi.balconi_ringhiere.azione}
                  onValueChange={(value) => setElemento("balconi_ringhiere", { ...config.elementi.balconi_ringhiere, azione: value as ConfigurazioneFacciata["elementi"]["balconi_ringhiere"]["azione"] })}
                >
                  <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mantieni">Mantieni</SelectItem>
                    <SelectItem value="vernicia">Vernicia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs max-md:text-[11px]">Colore ringhiere</Label>
                <Input
                  value={config.elementi.balconi_ringhiere.colore_hex ?? ""}
                  onChange={(e) => setElemento("balconi_ringhiere", { ...config.elementi.balconi_ringhiere, colore_hex: e.target.value })}
                  placeholder="#2E3136"
                  className="mt-1 h-10 text-sm"
                />
              </div>
            </div>
            {/* Persiane esistenti: solo riverniciatura, stesso modello (cambiarle è il render persiane). */}
            <div className="grid gap-3 sm:grid-cols-[220px,1fr]">
              <div>
                <Label className="text-xs max-md:text-[11px]">Persiane e scuri</Label>
                <Select
                  value={config.elementi.persiane?.azione ?? "mantieni"}
                  onValueChange={(value) => setElemento("persiane", { ...(config.elementi.persiane ?? {}), azione: value as NonNullable<ConfigurazioneFacciata["elementi"]["persiane"]>["azione"] })}
                >
                  <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mantieni">Mantieni</SelectItem>
                    <SelectItem value="vernicia">Vernicia (stesso modello)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {config.elementi.persiane?.azione === "vernicia" && (
                <div>
                  <Label className="text-xs max-md:text-[11px]">Colore persiane</Label>
                  <Input
                    value={config.elementi.persiane.colore_hex ?? ""}
                    onChange={(e) => setElemento("persiane", { ...config.elementi.persiane!, colore_hex: e.target.value })}
                    placeholder="Es. verde vagone RAL 6009"
                    className="mt-1 h-10 text-sm"
                  />
                </div>
              )}
            </div>
          </div>
          </DettagliTelefono>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 max-md:p-3 max-md:pb-2">
          <CardTitle className="text-sm flex items-center gap-2 max-md:text-[13px]">
            <Ruler className="h-4 w-4 text-orange-600" />
            Note operative e vincoli
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 max-md:p-3 max-md:pt-0">
          <Textarea
            value={config.note_libere ?? ""}
            onChange={(e) => update({ note_libere: e.target.value })}
            rows={4}
            placeholder={isMobile
              ? "Es. rivestimento solo al piano terra, ringhiere solo verniciate…"
              : "Esempio: rivestimento solo al piano terra, facciata superiore invariata; cornici sottili e pulite; ringhiere solo verniciate, senza cambiare disegno."}
            className="max-md:min-h-[88px] max-md:placeholder:text-[13px]"
          />
          {/* Telefono: la spiegazione del prompt resta al computer. */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900 max-md:hidden">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4" />
              Cosa proteggerà il prompt
            </div>
            <p className="mt-2 text-sm">
              Geometria edificio, aperture, cielo, strada, vegetazione, edifici vicini, proporzioni, prospettiva e tutte le zone non esplicitamente coinvolte.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
