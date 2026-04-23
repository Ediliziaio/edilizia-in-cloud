import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type {
  Bisellatura,
  ConfigurazionePavimento,
  DirezionePosa,
  EffettoVisivoPavimento,
  EssenzaLegno,
  FasceBordo,
  FinituraPavimento,
  GiuntoPerimetrale,
  PatternPosa,
  ScalaPattern,
  SogliePorte,
  TipoPavimento,
  VariazioneTono,
} from "@/modules/render-pavimento/lib/types";

type BattiscopaTipo = NonNullable<ConfigurazionePavimento["battiscopa"]>["tipo"];

const FLOOR_TYPES: Array<{
  value: TipoPavimento;
  label: string;
  detail: string;
  effect: EffettoVisivoPavimento;
  preview: string;
  defaults: Partial<ConfigurazionePavimento>;
}> = [
  {
    value: "parquet_massello",
    label: "Parquet massello",
    detail: "legno vero",
    effect: "legno",
    preview: "linear-gradient(90deg,#8c6239 0 22%,#a87543 22% 45%,#7b512f 45% 70%,#b27a48 70%)",
    defaults: { effetto_visivo: "legno", essenza_legno: "rovere_naturale", pattern_posa: "spina_di_pesce", larghezza_listello_mm: 90, lunghezza_listello_mm: 600, fuga_larghezza_mm: 0, bisellatura: "microbisello" },
  },
  {
    value: "parquet_prefinito",
    label: "Parquet prefinito",
    detail: "engineered",
    effect: "legno",
    preview: "linear-gradient(90deg,#c89d65 0 25%,#b98750 25% 50%,#d6ae77 50% 75%,#a97345 75%)",
    defaults: { effetto_visivo: "legno", essenza_legno: "rovere_miele", pattern_posa: "a_correre", larghezza_listello_mm: 160, lunghezza_listello_mm: 1400, fuga_larghezza_mm: 0, bisellatura: "microbisello" },
  },
  {
    value: "laminato",
    label: "Laminato",
    detail: "decorativo",
    effect: "legno",
    preview: "repeating-linear-gradient(90deg,#c7ad82 0 44px,#bda06f 44px 88px)",
    defaults: { effetto_visivo: "legno", essenza_legno: "rovere_sbiancato", pattern_posa: "a_correre", larghezza_listello_mm: 190, lunghezza_listello_mm: 1285, fuga_larghezza_mm: 0, bisellatura: "bisello_v" },
  },
  {
    value: "gres_porcellanato",
    label: "Gres",
    detail: "rettificato",
    effect: "cemento",
    preview: "linear-gradient(135deg,#b9b8b2,#858780)",
    defaults: { effetto_visivo: "cemento", pattern_posa: "rettilineo_dritto", formato_piastrella: "120x120", fuga_larghezza_mm: 2, fuga_colore: "tono_su_tono", scala_pattern: "grande_formato", bisellatura: "nessuna" },
  },
  {
    value: "ceramica",
    label: "Ceramica",
    detail: "smaltata",
    effect: "neutro",
    preview: "repeating-linear-gradient(90deg,#d8d0bf 0 42px,#f4f0e6 42px 45px)",
    defaults: { effetto_visivo: "neutro", pattern_posa: "rettilineo_dritto", formato_piastrella: "30x60", fuga_larghezza_mm: 3, fuga_colore: "grigio_chiaro", scala_pattern: "standard" },
  },
  {
    value: "marmo",
    label: "Marmo",
    detail: "venatura naturale",
    effect: "marmo",
    preview: "linear-gradient(135deg,#f4f0e7,#cbc4b8 42%,#ffffff 43%,#aaa295 47%,#ebe5dc)",
    defaults: { effetto_visivo: "marmo", pattern_posa: "rettilineo_dritto", formato_piastrella: "120x120", fuga_larghezza_mm: 1, fuga_colore: "tono_su_tono", scala_pattern: "maxi_lastre", finitura: "lucido" },
  },
  {
    value: "pietra_naturale",
    label: "Pietra",
    detail: "minerale",
    effect: "pietra",
    preview: "linear-gradient(135deg,#8b8172,#b4aa98,#736d62)",
    defaults: { effetto_visivo: "pietra", pattern_posa: "opus_romanum", formato_piastrella: "60x60", fuga_larghezza_mm: 4, fuga_colore: "beige", bisellatura: "bordo_irregolare" },
  },
  {
    value: "vinile_lvt",
    label: "LVT/SPC",
    detail: "sottile",
    effect: "legno",
    preview: "repeating-linear-gradient(90deg,#9a7b5a 0 60px,#ad8b66 60px 120px)",
    defaults: { effetto_visivo: "legno", essenza_legno: "noce", pattern_posa: "a_correre", larghezza_listello_mm: 180, lunghezza_listello_mm: 1220, fuga_larghezza_mm: 0, bisellatura: "microbisello" },
  },
  {
    value: "cotto",
    label: "Cotto",
    detail: "artigianale",
    effect: "cotto",
    preview: "repeating-linear-gradient(90deg,#b85a35 0 38px,#cf7347 38px 76px,#9c472d 76px 114px)",
    defaults: { effetto_visivo: "cotto", pattern_posa: "a_correre", formato_piastrella: "20x20", fuga_larghezza_mm: 6, fuga_colore: "beige", bisellatura: "bordo_irregolare", variazione_tono: "marcata" },
  },
  {
    value: "cemento_resina",
    label: "Cemento / resina",
    detail: "continuo",
    effect: "resina",
    preview: "radial-gradient(circle at 30% 20%,#aaa 0,#8e8e8a 30%,#747772 70%)",
    defaults: { effetto_visivo: "resina", pattern_posa: "rettilineo_dritto", fuga_larghezza_mm: 0, scala_pattern: "standard", bisellatura: "nessuna", variazione_tono: "leggera" },
  },
  {
    value: "resina_continua",
    label: "Resina continua",
    detail: "senza fughe",
    effect: "resina",
    preview: "linear-gradient(135deg,#c5c0b4,#a9a397,#d2ccc0)",
    defaults: { effetto_visivo: "resina", pattern_posa: "rettilineo_dritto", fuga_larghezza_mm: 0, bisellatura: "nessuna", variazione_tono: "uniforme" },
  },
  {
    value: "microcemento",
    label: "Microcemento",
    detail: "spatolato",
    effect: "cemento",
    preview: "radial-gradient(circle at 70% 30%,#bbb7ad,#8d8b83 48%,#ada89e)",
    defaults: { effetto_visivo: "cemento", pattern_posa: "rettilineo_dritto", fuga_larghezza_mm: 0, bisellatura: "nessuna", variazione_tono: "leggera" },
  },
  {
    value: "moquette",
    label: "Moquette",
    detail: "tessile",
    effect: "tessile",
    preview: "repeating-linear-gradient(90deg,#6f6256 0 2px,#76695c 2px 4px)",
    defaults: { effetto_visivo: "tessile", pattern_posa: "rettilineo_dritto", fuga_larghezza_mm: 0, bisellatura: "nessuna", variazione_tono: "uniforme" },
  },
  {
    value: "terrazzo_veneziano",
    label: "Terrazzo",
    detail: "graniglia",
    effect: "terrazzo",
    preview: "radial-gradient(circle at 10% 20%,#fff 0 2px,transparent 3px),radial-gradient(circle at 70% 45%,#8c8c8c 0 3px,transparent 4px),linear-gradient(135deg,#d6d0c5,#bfb5a8)",
    defaults: { effetto_visivo: "terrazzo", pattern_posa: "rettilineo_dritto", fuga_larghezza_mm: 0, bisellatura: "nessuna", variazione_tono: "naturale" },
  },
];

const PATTERNS: Array<{ value: PatternPosa; label: string; detail: string; preview: string }> = [
  { value: "rettilineo_dritto", label: "Rettilineo", detail: "griglia pulita", preview: "linear-gradient(90deg,transparent 0 46%,#d5d5d5 47% 49%,transparent 50%),linear-gradient(0deg,transparent 0 46%,#d5d5d5 47% 49%,transparent 50%)" },
  { value: "a_correre", label: "A correre", detail: "sfalsato 50%", preview: "repeating-linear-gradient(0deg,#d5d5d5 0 2px,transparent 2px 18px),repeating-linear-gradient(90deg,#d5d5d5 0 2px,transparent 2px 42px)" },
  { value: "sfalsato_33", label: "Sfalsato 1/3", detail: "taglio tecnico", preview: "repeating-linear-gradient(0deg,#d5d5d5 0 2px,transparent 2px 18px),repeating-linear-gradient(90deg,#d5d5d5 0 2px,transparent 2px 56px)" },
  { value: "spina_di_pesce", label: "Spina pesce", detail: "90 gradi", preview: "repeating-linear-gradient(45deg,#d5d5d5 0 2px,transparent 2px 14px),repeating-linear-gradient(-45deg,#d5d5d5 0 2px,transparent 2px 14px)" },
  { value: "spina_ungherese", label: "Ungherese", detail: "chevron", preview: "repeating-linear-gradient(55deg,#d5d5d5 0 2px,transparent 2px 18px),repeating-linear-gradient(-55deg,#d5d5d5 0 2px,transparent 2px 18px)" },
  { value: "diagonale_45", label: "Diagonale", detail: "45 gradi", preview: "repeating-linear-gradient(45deg,#d5d5d5 0 2px,transparent 2px 22px)" },
  { value: "cassero_irregolare", label: "Cassero", detail: "naturale", preview: "repeating-linear-gradient(0deg,#d5d5d5 0 2px,transparent 2px 14px),repeating-linear-gradient(90deg,#d5d5d5 0 2px,transparent 2px 31px)" },
  { value: "opus_romanum", label: "Opus", detail: "modulare", preview: "linear-gradient(90deg,#d5d5d5 0 2px,transparent 2px),linear-gradient(0deg,#d5d5d5 0 2px,transparent 2px)" },
  { value: "doppia_fila", label: "Doppia fila", detail: "listelli doppi", preview: "repeating-linear-gradient(90deg,#d5d5d5 0 2px,transparent 2px 16px)" },
  { value: "modulare", label: "Modulare", detail: "geometrico", preview: "radial-gradient(circle at 40% 40%,#d5d5d5 0 3px,transparent 4px),linear-gradient(90deg,#d5d5d5 0 2px,transparent 2px)" },
  { value: "esagonale", label: "Esagonale", detail: "honeycomb", preview: "repeating-linear-gradient(60deg,#d5d5d5 0 2px,transparent 2px 18px),repeating-linear-gradient(-60deg,#d5d5d5 0 2px,transparent 2px 18px)" },
];

const FINITURE: Array<{ value: FinituraPavimento; label: string }> = [
  { value: "lucido", label: "Lucido" },
  { value: "opaco", label: "Opaco" },
  { value: "satinato", label: "Satinato" },
  { value: "spazzolato", label: "Spazzolato" },
  { value: "boccardato", label: "Boccardato" },
  { value: "anticato", label: "Anticato" },
  { value: "levigato", label: "Levigato" },
  { value: "naturale", label: "Naturale" },
  { value: "cerato", label: "Cerato" },
];

const EFFECTS: Array<{ value: EffettoVisivoPavimento; label: string }> = [
  { value: "legno", label: "Legno" },
  { value: "marmo", label: "Marmo" },
  { value: "pietra", label: "Pietra" },
  { value: "cemento", label: "Cemento" },
  { value: "resina", label: "Resina" },
  { value: "cotto", label: "Cotto" },
  { value: "tessile", label: "Tessile" },
  { value: "terrazzo", label: "Terrazzo" },
  { value: "neutro", label: "Neutro" },
];

const WOOD_ESSENCES: Array<{ value: EssenzaLegno; label: string; color: string }> = [
  { value: "rovere_naturale", label: "Rovere naturale", color: "#c49a63" },
  { value: "rovere_sbiancato", label: "Rovere sbiancato", color: "#d8cdbb" },
  { value: "rovere_miele", label: "Rovere miele", color: "#c88f45" },
  { value: "noce", label: "Noce", color: "#6d442b" },
  { value: "teak", label: "Teak", color: "#a66b34" },
  { value: "wenghe", label: "Wenge", color: "#2d2119" },
  { value: "frassino_bianco", label: "Frassino bianco", color: "#eadfc9" },
];

const TONE_VARIATIONS: Array<{ value: VariazioneTono; label: string }> = [
  { value: "uniforme", label: "Uniforme" },
  { value: "leggera", label: "Leggera" },
  { value: "naturale", label: "Naturale" },
  { value: "marcata", label: "Marcata" },
];

const BEVELS: Array<{ value: Bisellatura; label: string }> = [
  { value: "nessuna", label: "Nessuna" },
  { value: "microbisello", label: "Microbisello" },
  { value: "bisello_v", label: "Bisello a V" },
  { value: "bordo_irregolare", label: "Bordo irregolare" },
];

const DIRECTIONS: Array<{ value: DirezionePosa; label: string }> = [
  { value: "segue_prospettiva", label: "Segue prospettiva foto" },
  { value: "parallela_parete_lunga", label: "Parallela parete lunga" },
  { value: "perpendicolare_parete_lunga", label: "Perpendicolare parete lunga" },
  { value: "verso_finestra", label: "Verso finestra/luce" },
  { value: "diagonale_45", label: "Diagonale 45 gradi" },
];

const SCALES: Array<{ value: ScalaPattern; label: string }> = [
  { value: "compatta", label: "Compatta" },
  { value: "standard", label: "Standard" },
  { value: "grande_formato", label: "Grande formato" },
  { value: "maxi_lastre", label: "Maxi lastre" },
];

const THRESHOLDS: Array<{ value: SogliePorte; label: string }> = [
  { value: "mantieni", label: "Mantieni soglie" },
  { value: "sostituisci_coerenti", label: "Soglie coordinate" },
  { value: "integra_senza_soglia", label: "Senza soglia visibile" },
];

const PERIMETER_JOINTS: Array<{ value: GiuntoPerimetrale; label: string }> = [
  { value: "standard_nascosto", label: "Nascosto" },
  { value: "ombra_sottile", label: "Ombra sottile" },
  { value: "sigillatura_elastica", label: "Sigillatura elastica" },
];

const BORDER_BANDS: Array<{ value: FasceBordo; label: string }> = [
  { value: "nessuna", label: "Nessuna" },
  { value: "cornice_perimetrale", label: "Cornice perimetrale" },
  { value: "fascia_stesso_materiale", label: "Fascia stesso materiale" },
];

const FORMATI = [
  "20x20", "30x30", "45x45", "60x60", "60x120", "80x80", "120x120", "120x240", "30x60",
];

const FUGA_COLORI: Array<{ value: NonNullable<ConfigurazionePavimento["fuga_colore"]>; label: string }> = [
  { value: "bianco", label: "Bianco" },
  { value: "grigio_chiaro", label: "Grigio chiaro" },
  { value: "grigio_scuro", label: "Grigio scuro" },
  { value: "nero", label: "Nero" },
  { value: "beige", label: "Beige" },
  { value: "tono_su_tono", label: "Tono su tono" },
];

const BATTISCOPA_TIPI: Array<{ value: NonNullable<BattiscopaTipo>; label: string }> = [
  { value: "coordinato_pavimento", label: "Coordinato al pavimento" },
  { value: "bianco", label: "Bianco" },
  { value: "legno", label: "Legno" },
  { value: "alluminio", label: "Alluminio" },
];

interface Props {
  value: ConfigurazionePavimento;
  onChange: (v: ConfigurazionePavimento) => void;
  disabled?: boolean;
}

function isSeamless(type: TipoPavimento): boolean {
  return ["cemento_resina", "resina_continua", "microcemento", "moquette", "terrazzo_veneziano"].includes(type);
}

function isWoodLike(config: ConfigurazionePavimento): boolean {
  return config.effetto_visivo === "legno" || ["parquet_massello", "parquet_prefinito", "laminato", "vinile_lvt"].includes(config.tipo);
}

export function PavimentoConfigForm({ value, onChange, disabled }: Props) {
  const set = <K extends keyof ConfigurazionePavimento>(
    key: K,
    val: ConfigurazionePavimento[K],
  ) => onChange({ ...value, [key]: val });

  const update = (patch: Partial<ConfigurazionePavimento>) => onChange({ ...value, ...patch });
  const selectedType = FLOOR_TYPES.find((item) => item.value === value.tipo) ?? FLOOR_TYPES[0];
  const seamless = isSeamless(value.tipo);
  const woodLike = isWoodLike(value);
  const isSostituisciBattiscopa = value.battiscopa?.azione === "sostituisci";

  const applyType = (type: TipoPavimento) => {
    const option = FLOOR_TYPES.find((item) => item.value === type);
    update({
      tipo: type,
      colore_mode: option?.effect === "legno" ? "legno" : value.colore_mode,
      ...(option?.defaults ?? {}),
    });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-muted/25 p-3">
        <div className="flex items-start gap-3">
          <div
            className="h-16 w-20 shrink-0 rounded-md border"
            style={{ background: selectedType.preview, backgroundColor: value.colore_hex ?? "#b0b0b0" }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{selectedType.label}</p>
              <Badge variant="secondary">{value.pattern_posa.replace(/_/g, " ")}</Badge>
              {seamless && <Badge variant="outline">senza fughe</Badge>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {value.colore_nome || "Colore selezionato"} · {value.finitura} · {value.scala_pattern || "scala standard"}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Materiale *</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FLOOR_TYPES.map((ft) => (
            <button
              key={ft.value}
              type="button"
              disabled={disabled}
              onClick={() => applyType(ft.value)}
              className={`rounded-lg border p-2 text-left transition-all text-xs
                ${value.tipo === ft.value
                  ? "border-primary bg-primary/5 ring-2 ring-primary/25"
                  : "border-border hover:border-primary/40"
                } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              <div className="mb-2 h-8 rounded border" style={{ background: ft.preview }} />
              <span className="block font-semibold leading-tight">{ft.label}</span>
              <span className="block text-[11px] text-muted-foreground">{ft.detail}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Effetto visivo</Label>
          <Select
            value={value.effetto_visivo ?? selectedType.effect}
            onValueChange={(v) => set("effetto_visivo", v as EffettoVisivoPavimento)}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {EFFECTS.map((effect) => (
                <SelectItem key={effect.value} value={effect.value}>{effect.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Finitura</Label>
          <Select
            value={value.finitura}
            onValueChange={(v) => set("finitura", v as FinituraPavimento)}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FINITURE.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {woodLike && (
        <div className="space-y-2">
          <Label>Essenza legno</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {WOOD_ESSENCES.map((wood) => (
              <button
                key={wood.value}
                type="button"
                disabled={disabled}
                onClick={() => update({ essenza_legno: wood.value, colore_nome: wood.label, colore_hex: wood.color })}
                className={`rounded-lg border p-2 text-left text-xs transition-all
                  ${value.essenza_legno === wood.value
                    ? "border-primary bg-primary/5 ring-2 ring-primary/25"
                    : "border-border hover:border-primary/40"
                  } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              >
                <span className="mb-1 block h-6 rounded border" style={{ backgroundColor: wood.color }} />
                <span className="font-medium">{wood.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr_88px]">
        <div className="space-y-1.5">
          <Label>Colore / nome commerciale</Label>
          <Input
            value={value.colore_nome ?? ""}
            onChange={(e) => set("colore_nome", e.target.value)}
            placeholder="Es. Rovere naturale, Calacatta oro, cemento caldo"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Campione</Label>
          <Input
            type="color"
            value={value.colore_hex ?? "#b0b0b0"}
            onChange={(e) => set("colore_hex", e.target.value)}
            disabled={disabled}
            className="h-10 w-full p-1"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Schema di posa *</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PATTERNS.map((p) => (
            <button
              key={p.value}
              type="button"
              disabled={disabled}
              onClick={() => set("pattern_posa", p.value)}
              className={`rounded-lg border p-2 text-left text-xs transition-all
                ${value.pattern_posa === p.value
                  ? "border-primary bg-primary/5 ring-2 ring-primary/25"
                  : "border-border hover:border-primary/40"
                } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              <span className="mb-2 block h-7 rounded bg-muted" style={{ backgroundImage: p.preview }} />
              <span className="block font-semibold">{p.label}</span>
              <span className="block text-[11px] text-muted-foreground">{p.detail}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Direzione posa</Label>
          <Select
            value={value.direzione_posa ?? "segue_prospettiva"}
            onValueChange={(v) => set("direzione_posa", v as DirezionePosa)}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DIRECTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Scala pattern</Label>
          <Select
            value={value.scala_pattern ?? "standard"}
            onValueChange={(v) => set("scala_pattern", v as ScalaPattern)}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SCALES.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Variazione tono</Label>
          <Select
            value={value.variazione_tono ?? "naturale"}
            onValueChange={(v) => set("variazione_tono", v as VariazioneTono)}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TONE_VARIATIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Formato piastrella</Label>
          <Select
            value={value.formato_piastrella ?? "60x60"}
            onValueChange={(v) => set("formato_piastrella", v)}
            disabled={disabled || seamless}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FORMATI.map((f) => (
                <SelectItem key={f} value={f}>{f} cm</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Larghezza listello</Label>
          <Input
            type="number"
            min={50}
            max={400}
            value={value.larghezza_listello_mm ?? ""}
            onChange={(e) => set("larghezza_listello_mm", Number(e.target.value) || undefined)}
            disabled={disabled || !woodLike}
            placeholder="mm"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Lunghezza listello</Label>
          <Input
            type="number"
            min={100}
            max={3000}
            value={value.lunghezza_listello_mm ?? ""}
            onChange={(e) => set("lunghezza_listello_mm", Number(e.target.value) || undefined)}
            disabled={disabled || !woodLike}
            placeholder="mm"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Fuga / giunto (mm)</Label>
          <Input
            type="number"
            min={0}
            max={15}
            value={seamless ? 0 : value.fuga_larghezza_mm ?? 2}
            onChange={(e) => set("fuga_larghezza_mm", Number(e.target.value))}
            disabled={disabled || seamless}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Colore fuga</Label>
          <Select
            value={value.fuga_colore ?? "tono_su_tono"}
            onValueChange={(v) => set("fuga_colore", v as ConfigurazionePavimento["fuga_colore"])}
            disabled={disabled || seamless}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FUGA_COLORI.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Bisellatura</Label>
          <Select
            value={value.bisellatura ?? "nessuna"}
            onValueChange={(v) => set("bisellatura", v as Bisellatura)}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BEVELS.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border p-3">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Soglie porte</Label>
            <Select
              value={value.soglie_porte ?? "mantieni"}
              onValueChange={(v) => set("soglie_porte", v as SogliePorte)}
              disabled={disabled}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {THRESHOLDS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Giunto perimetrale</Label>
            <Select
              value={value.giunto_perimetrale ?? "standard_nascosto"}
              onValueChange={(v) => set("giunto_perimetrale", v as GiuntoPerimetrale)}
              disabled={disabled}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIMETER_JOINTS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fasce bordo</Label>
            <Select
              value={value.fasce_bordo ?? "nessuna"}
              onValueChange={(v) => set("fasce_bordo", v as FasceBordo)}
              disabled={disabled}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BORDER_BANDS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm font-semibold">Battiscopa</Label>
          <Select
            value={value.battiscopa?.azione ?? "mantieni"}
            onValueChange={(v) =>
              set("battiscopa", {
                ...value.battiscopa,
                azione: v as "mantieni" | "sostituisci" | "rimuovi",
              })
            }
            disabled={disabled}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mantieni">Mantieni</SelectItem>
              <SelectItem value="sostituisci">Sostituisci</SelectItem>
              <SelectItem value="rimuovi">Rimuovi</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isSostituisciBattiscopa && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select
                value={value.battiscopa?.tipo ?? "coordinato_pavimento"}
                onValueChange={(v) =>
                  set("battiscopa", {
                    ...value.battiscopa!,
                    tipo: v as BattiscopaTipo,
                  })
                }
                disabled={disabled}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BATTISCOPA_TIPI.map((b) => (
                    <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Altezza</Label>
              <Select
                value={String(value.battiscopa?.altezza_cm ?? 8)}
                onValueChange={(v) =>
                  set("battiscopa", {
                    ...value.battiscopa!,
                    altezza_cm: Number(v) as 6 | 8 | 10,
                  })
                }
                disabled={disabled}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">6 cm</SelectItem>
                  <SelectItem value="8">8 cm</SelectItem>
                  <SelectItem value="10">10 cm</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Note aggiuntive</Label>
        <Textarea
          value={value.note_libere ?? ""}
          onChange={(e) => set("note_libere", e.target.value)}
          placeholder="Es. mantenere tappeto, non modificare porte, posa continua verso la cucina..."
          rows={3}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
