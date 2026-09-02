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
  TipoInterventoFacciata,
} from "@/modules/render-facciata/lib/types";

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

  return (
    <div className="space-y-4">
      {analysis && (
        <Card className="border-orange-200 bg-orange-50/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
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
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4 text-orange-600" />
            Tipo di intervento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {INTERVENTION_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                className={`rounded-xl border p-4 text-left transition ${cardClass(config.tipo_intervento === option.value)}`}
                onClick={() => update({ tipo_intervento: option.value })}
              >
                <p className="text-sm font-semibold">{option.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{option.desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm flex items-center gap-2">
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
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[180px,1fr,140px]">
              <div>
                <Label className="text-xs">Colore</Label>
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
                <Label className="text-xs">Nome / RAL</Label>
                <div className="mt-1 grid gap-2 md:grid-cols-2">
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
                <Label className="text-xs">Zona</Label>
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
              <Label className="text-xs">Finitura</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {FINISH_OPTIONS.map((finish) => (
                  <button
                    type="button"
                    key={finish.value}
                    className={`rounded-xl border p-3 text-left transition ${cardClass(config.intonaco.finitura === finish.value)}`}
                    onClick={() => update({ intonaco: { ...config.intonaco, finitura: finish.value } })}
                  >
                    <p className="text-sm font-semibold">{finish.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{finish.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm flex items-center gap-2">
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
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {CLADDING_OPTIONS.map((material) => (
                <button
                  type="button"
                  key={material.value}
                  className={`rounded-xl border p-3 text-left transition ${cardClass(config.rivestimento.tipo === material.value)}`}
                  onClick={() => update({ rivestimento: { ...config.rivestimento, tipo: material.value } })}
                >
                  <p className="text-sm font-semibold">{material.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{material.desc}</p>
                </button>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label className="text-xs">Zona applicazione</Label>
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
                <Label className="text-xs">Posa / composizione</Label>
                <Select
                  value={config.rivestimento.posa ?? "corsi_regolari"}
                  onValueChange={(value) => update({ rivestimento: { ...config.rivestimento, posa: value as NonNullable<ConfigurazioneFacciata["rivestimento"]["posa"]> } })}
                >
                  <SelectTrigger className="mt-1 h-10 text-sm">
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
              <div>
                <Label className="text-xs">Colore fuga / giunto</Label>
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
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm flex items-center gap-2">
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
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <Label className="text-xs">Spessore</Label>
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
                <Label className="text-xs">Sistema</Label>
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
                <Label className="text-xs">Zona</Label>
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
                <Label className="text-xs">Colore finitura</Label>
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Columns2 className="h-4 w-4 text-orange-600" />
            Elementi architettonici e dettagli
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border p-4 space-y-3">
              <p className="text-sm font-semibold">Cornici e marcapiani</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Cornici finestre</Label>
                  <Select
                    value={config.elementi.cornici_finestre.azione}
                    onValueChange={(value) => update({ elementi: { ...config.elementi, cornici_finestre: { ...config.elementi.cornici_finestre, azione: value as ConfigurazioneFacciata["elementi"]["cornici_finestre"]["azione"] } } })}
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
                  <Label className="text-xs">Marcapiani</Label>
                  <Select
                    value={config.elementi.marcapiani.azione}
                    onValueChange={(value) => update({ elementi: { ...config.elementi, marcapiani: { ...config.elementi.marcapiani, azione: value as ConfigurazioneFacciata["elementi"]["marcapiani"]["azione"] } } })}
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
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={config.elementi.cornici_finestre.colore_hex ?? ""}
                  onChange={(e) => update({ elementi: { ...config.elementi, cornici_finestre: { ...config.elementi.cornici_finestre, colore_hex: e.target.value } } })}
                  placeholder="Colore cornici (#FFFFFF)"
                  className="h-10 text-sm"
                />
                <Input
                  value={config.elementi.marcapiani.spessore ?? ""}
                  onChange={(e) => update({ elementi: { ...config.elementi, marcapiani: { ...config.elementi.marcapiani, spessore: e.target.value } } })}
                  placeholder="Spessore marcapiani"
                  className="h-10 text-sm"
                />
              </div>
            </div>

            <div className="rounded-xl border p-4 space-y-3">
              <p className="text-sm font-semibold">Davanzali, zoccolatura, gronde</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Davanzali</Label>
                  <Select
                    value={config.elementi.davanzali.azione}
                    onValueChange={(value) => update({ elementi: { ...config.elementi, davanzali: { ...config.elementi.davanzali, azione: value as ConfigurazioneFacciata["elementi"]["davanzali"]["azione"] } } })}
                  >
                    <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mantieni">Mantieni</SelectItem>
                      <SelectItem value="sostituisci">Sostituisci</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Zoccolatura</Label>
                  <Select
                    value={config.elementi.zoccolatura.azione}
                    onValueChange={(value) => update({ elementi: { ...config.elementi, zoccolatura: { ...config.elementi.zoccolatura, azione: value as ConfigurazioneFacciata["elementi"]["zoccolatura"]["azione"] } } })}
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
                  <Label className="text-xs">Gronde</Label>
                  <Select
                    value={config.elementi.gronde.azione}
                    onValueChange={(value) => update({ elementi: { ...config.elementi, gronde: { ...config.elementi.gronde, azione: value as ConfigurazioneFacciata["elementi"]["gronde"]["azione"] } } })}
                  >
                    <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mantieni">Mantieni</SelectItem>
                      <SelectItem value="sostituisci">Sostituisci</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  value={config.elementi.davanzali.materiale ?? ""}
                  onChange={(e) => update({ elementi: { ...config.elementi, davanzali: { ...config.elementi.davanzali, materiale: e.target.value as ConfigurazioneFacciata["elementi"]["davanzali"]["materiale"] } } })}
                  placeholder="Materiale davanzali"
                  className="h-10 text-sm"
                />
                <Input
                  value={String(config.elementi.zoccolatura.altezza_cm ?? "")}
                  onChange={(e) => update({ elementi: { ...config.elementi, zoccolatura: { ...config.elementi.zoccolatura, altezza_cm: e.target.value ? Number(e.target.value) : undefined } } })}
                  placeholder="Altezza zoccolatura"
                  className="h-10 text-sm"
                />
                <Input
                  value={config.elementi.gronde.materiale ?? ""}
                  onChange={(e) => update({ elementi: { ...config.elementi, gronde: { ...config.elementi.gronde, materiale: e.target.value as ConfigurazioneFacciata["elementi"]["gronde"]["materiale"] } } })}
                  placeholder="Materiale gronde"
                  className="h-10 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4 space-y-3">
            <p className="text-sm font-semibold">Balconi e ringhiere</p>
            <div className="grid gap-3 sm:grid-cols-[220px,1fr]">
              <div>
                <Label className="text-xs">Azione ringhiere</Label>
                <Select
                  value={config.elementi.balconi_ringhiere.azione}
                  onValueChange={(value) => update({ elementi: { ...config.elementi, balconi_ringhiere: { ...config.elementi.balconi_ringhiere, azione: value as ConfigurazioneFacciata["elementi"]["balconi_ringhiere"]["azione"] } } })}
                >
                  <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mantieni">Mantieni</SelectItem>
                    <SelectItem value="vernicia">Vernicia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Colore ringhiere</Label>
                <Input
                  value={config.elementi.balconi_ringhiere.colore_hex ?? ""}
                  onChange={(e) => update({ elementi: { ...config.elementi, balconi_ringhiere: { ...config.elementi.balconi_ringhiere, colore_hex: e.target.value } } })}
                  placeholder="#2E3136"
                  className="mt-1 h-10 text-sm"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Ruler className="h-4 w-4 text-orange-600" />
            Note operative e vincoli
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={config.note_libere ?? ""}
            onChange={(e) => update({ note_libere: e.target.value })}
            rows={4}
            placeholder="Esempio: rivestimento solo al piano terra, facciata superiore invariata; cornici sottili e pulite; ringhiere solo verniciate, senza cambiare disegno."
          />
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900">
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
