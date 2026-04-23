import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type {
  ConfigurazioneBagno,
  TipoIntervento,
} from "@/modules/render-bagno/lib/types";
import { cn } from "@/lib/utils";

export type BathroomConfig = ConfigurazioneBagno;

type VisualOption = {
  value: string;
  label: string;
  hint?: string;
  previewStyle: CSSProperties;
};

function marbleStyle(base: string, vein: string, accent: string): CSSProperties {
  return {
    backgroundColor: base,
    backgroundImage: [
      "linear-gradient(135deg, rgba(255,255,255,0.82), rgba(255,255,255,0.2))",
      `repeating-linear-gradient(118deg, transparent 0 22px, ${vein} 22px 26px, transparent 26px 54px)`,
      `radial-gradient(circle at 24% 28%, ${accent} 0 10%, transparent 10% 100%)`,
      "radial-gradient(circle at 78% 62%, rgba(255,255,255,0.55) 0 8%, transparent 8% 100%)",
    ].join(", "),
    backgroundSize: "100% 100%, 180px 180px, 160px 160px, 180px 180px",
  };
}

function cementStyle(base: string, grain: string): CSSProperties {
  return {
    backgroundColor: base,
    backgroundImage: [
      `linear-gradient(145deg, rgba(255,255,255,0.18), ${grain})`,
      "radial-gradient(circle at 18% 26%, rgba(255,255,255,0.18) 0 3%, transparent 3% 100%)",
      "radial-gradient(circle at 70% 68%, rgba(0,0,0,0.1) 0 4%, transparent 4% 100%)",
      "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 26px)",
    ].join(", "),
    backgroundSize: "100% 100%, 72px 72px, 92px 92px, 100% 100%",
  };
}

function woodStyle(base: string, grainLight: string, grainDark: string): CSSProperties {
  return {
    backgroundColor: base,
    backgroundImage: [
      `linear-gradient(90deg, ${grainLight}, ${grainDark}, ${grainLight})`,
      "repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0 6px, transparent 6px 14px, rgba(0,0,0,0.08) 14px 16px, transparent 16px 28px)",
      "radial-gradient(circle at 18% 50%, rgba(80,50,25,0.18) 0 5%, transparent 5% 100%)",
    ].join(", "),
    backgroundSize: "100% 100%, 180px 100%, 120px 120px",
  };
}

function solidStyle(base: string, sheen = "rgba(255,255,255,0.18)"): CSSProperties {
  return {
    backgroundColor: base,
    backgroundImage: `linear-gradient(145deg, ${sheen}, rgba(255,255,255,0.02) 48%, rgba(0,0,0,0.08) 100%)`,
  };
}

function stoneStyle(base: string, shadow: string): CSSProperties {
  return {
    backgroundColor: base,
    backgroundImage: [
      `linear-gradient(135deg, rgba(255,255,255,0.18), ${shadow})`,
      "repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0 3px, transparent 3px 18px)",
      "repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0 2px, transparent 2px 16px)",
    ].join(", "),
  };
}

function mosaicStyle(base: string, accent: string): CSSProperties {
  return {
    backgroundColor: base,
    backgroundImage: [
      `radial-gradient(circle, ${accent} 0 46%, transparent 48%)`,
      "linear-gradient(0deg, rgba(255,255,255,0.85), rgba(255,255,255,0.85))",
    ].join(", "),
    backgroundSize: "18px 18px, 18px 18px",
    backgroundPosition: "0 0, 0 0",
  };
}

function zelligeStyle(base: string, edge: string): CSSProperties {
  return {
    backgroundColor: base,
    backgroundImage: [
      `linear-gradient(135deg, rgba(255,255,255,0.4), ${edge})`,
      "repeating-linear-gradient(0deg, rgba(255,255,255,0.8) 0 2px, transparent 2px 22px)",
      "repeating-linear-gradient(90deg, rgba(255,255,255,0.8) 0 2px, transparent 2px 22px)",
      "radial-gradient(circle at 30% 28%, rgba(255,255,255,0.3) 0 12%, transparent 12% 100%)",
    ].join(", "),
    backgroundSize: "100% 100%, 24px 24px, 24px 24px, 100% 100%",
  };
}

function resinStyle(base: string, accent: string): CSSProperties {
  return {
    backgroundColor: base,
    backgroundImage: [
      `linear-gradient(135deg, rgba(255,255,255,0.16), ${accent})`,
      "radial-gradient(circle at 24% 30%, rgba(255,255,255,0.18) 0 6%, transparent 6% 100%)",
      "repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 14px, rgba(0,0,0,0.03) 14px 28px)",
    ].join(", "),
  };
}

function finishStyle(base: string, highlight: string): CSSProperties {
  return {
    backgroundColor: base,
    backgroundImage: `linear-gradient(135deg, ${highlight}, rgba(255,255,255,0.08) 40%, rgba(0,0,0,0.22) 100%)`,
  };
}

const TILE_EFFECTS: VisualOption[] = [
  { value: "marmo_carrara", label: "Marmo Carrara", hint: "Bianco elegante con venature grigie", previewStyle: marbleStyle("#e9edf1", "rgba(127,140,151,0.34)", "rgba(190,198,207,0.3)") },
  { value: "marmo_calacatta", label: "Marmo Calacatta", hint: "Bianco caldo con venature decise", previewStyle: marbleStyle("#f2efe8", "rgba(140,122,80,0.28)", "rgba(222,207,168,0.32)") },
  { value: "marmo_sahara_noir", label: "Sahara Noir", hint: "Nero lucido con venature oro", previewStyle: marbleStyle("#151515", "rgba(193,148,70,0.36)", "rgba(255,224,150,0.18)") },
  { value: "marmo_marquinia", label: "Marmo Marquinia", hint: "Nero con venature bianche", previewStyle: marbleStyle("#17191d", "rgba(233,236,241,0.34)", "rgba(255,255,255,0.18)") },
  { value: "marmo_verde_guatemala", label: "Verde Guatemala", hint: "Verde profondo effetto luxury", previewStyle: marbleStyle("#1d4338", "rgba(215,235,225,0.32)", "rgba(92,149,130,0.24)") },
  { value: "marmo_statuario", label: "Marmo Statuario", hint: "Bianco luminoso e scenografico", previewStyle: marbleStyle("#f8f8f6", "rgba(137,145,154,0.38)", "rgba(240,221,188,0.22)") },
  { value: "marmo_emperador", label: "Marmo Emperador", hint: "Marrone caldo con venature crema", previewStyle: marbleStyle("#5a4338", "rgba(229,210,191,0.28)", "rgba(139,89,58,0.18)") },
  { value: "cemento_grigio", label: "Cemento grigio", hint: "Minimal e contemporaneo", previewStyle: cementStyle("#989c9f", "rgba(91,95,99,0.38)") },
  { value: "cemento_bianco", label: "Cemento bianco", hint: "Pulito, morbido, luminoso", previewStyle: cementStyle("#e6e3db", "rgba(175,171,160,0.3)") },
  { value: "cemento_antracite", label: "Cemento antracite", hint: "Scuro e deciso", previewStyle: cementStyle("#383d43", "rgba(21,24,28,0.4)") },
  { value: "legno_rovere_chiaro", label: "Rovere chiaro", hint: "Caldo e naturale", previewStyle: woodStyle("#cda36f", "rgba(242,210,164,0.24)", "rgba(120,74,34,0.28)") },
  { value: "legno_rovere_scuro", label: "Rovere scuro", hint: "Materico e caldo", previewStyle: woodStyle("#8d623f", "rgba(184,137,96,0.28)", "rgba(84,50,28,0.34)") },
  { value: "legno_wenge", label: "Legno wenge", hint: "Profondo e sofisticato", previewStyle: woodStyle("#3b2b22", "rgba(91,68,51,0.2)", "rgba(17,10,7,0.34)") },
  { value: "ardesia", label: "Ardesia", hint: "Pietra scura molto moderna", previewStyle: stoneStyle("#3a4148", "rgba(18,22,27,0.34)") },
  { value: "travertino", label: "Travertino", hint: "Beige classico e accogliente", previewStyle: stoneStyle("#d8c6aa", "rgba(164,141,112,0.28)") },
  { value: "basalto", label: "Basalto", hint: "Pietra vulcanica compatta", previewStyle: stoneStyle("#2f3439", "rgba(10,13,16,0.3)") },
  { value: "mono_bianco", label: "Bianco monocromo", hint: "Pulito e senza tempo", previewStyle: solidStyle("#fcfcfb") },
  { value: "mono_nero", label: "Nero monocromo", hint: "Molto deciso", previewStyle: solidStyle("#121315", "rgba(255,255,255,0.12)") },
  { value: "mono_grigio", label: "Grigio monocromo", hint: "Neutro e versatile", previewStyle: solidStyle("#aeb3b7") },
  { value: "mono_verde_salvia", label: "Verde salvia", hint: "Rilassante e premium", previewStyle: solidStyle("#9faf9a") },
  { value: "mono_blu_navy", label: "Blu navy", hint: "Elegante con forte carattere", previewStyle: solidStyle("#23344d") },
  { value: "mono_terracotta", label: "Terracotta", hint: "Caldo e mediterraneo", previewStyle: solidStyle("#c96f45") },
  { value: "mono_greige", label: "Greige", hint: "Neutro caldo molto attuale", previewStyle: solidStyle("#c7bdb2") },
  { value: "mosaico_esagoni", label: "Mosaico esagoni", hint: "Geometrico e decorativo", previewStyle: mosaicStyle("#f8f7f3", "#9fa6ae") },
  { value: "mosaico_penny", label: "Mosaico penny", hint: "Retro ma curato", previewStyle: mosaicStyle("#fbfaf8", "#b5a18d") },
  { value: "zellige", label: "Zellige", hint: "Artigianale e luminoso", previewStyle: zelligeStyle("#c7d6d8", "rgba(110,127,130,0.28)") },
  { value: "cotto_toscano", label: "Cotto toscano", hint: "Molto caldo e autentico", previewStyle: zelligeStyle("#bc6f46", "rgba(126,66,33,0.32)") },
  { value: "resina_spatolata", label: "Resina spatolata", hint: "Continua, senza fughe", previewStyle: resinStyle("#c8c2b8", "rgba(100,90,78,0.2)") },
  { value: "pietra_ardesia", label: "Pietra ardesia", hint: "Materica con rilievo", previewStyle: stoneStyle("#252a30", "rgba(6,8,10,0.44)") },
];

const VANITY_TOP_OPTIONS: VisualOption[] = [
  { value: "marmo_bianco", label: "Marmo bianco", hint: "Chiaro e premium", previewStyle: marbleStyle("#eef1f4", "rgba(142,151,161,0.3)", "rgba(201,208,215,0.2)") },
  { value: "marmo_nero", label: "Marmo nero", hint: "Scuro scenografico", previewStyle: marbleStyle("#16171a", "rgba(238,241,245,0.28)", "rgba(160,160,160,0.15)") },
  { value: "quarzo", label: "Quarzo", hint: "Compatto e uniforme", previewStyle: stoneStyle("#d6d6d3", "rgba(115,115,110,0.18)") },
  { value: "legno", label: "Legno", hint: "Naturale e accogliente", previewStyle: woodStyle("#b57f54", "rgba(220,175,130,0.24)", "rgba(98,62,31,0.3)") },
  { value: "ceramica", label: "Ceramica", hint: "Pulita e pratica", previewStyle: solidStyle("#f4f4f2") },
];

const FAUCET_FINISH_OPTIONS: VisualOption[] = [
  { value: "cromo", label: "Cromo", hint: "Lucido a specchio", previewStyle: finishStyle("#bdc7d0", "rgba(255,255,255,0.72)") },
  { value: "nero_opaco", label: "Nero opaco", hint: "Grafico e contemporaneo", previewStyle: finishStyle("#1f2227", "rgba(255,255,255,0.18)") },
  { value: "oro_spazzolato", label: "Oro spazzolato", hint: "Caldo e luxury", previewStyle: finishStyle("#caa35b", "rgba(255,255,255,0.45)") },
  { value: "oro_rosa", label: "Oro rosa", hint: "Morbido e ricercato", previewStyle: finishStyle("#c88c7f", "rgba(255,255,255,0.42)") },
  { value: "acciaio_spazzolato", label: "Acciaio spazzolato", hint: "Tecnico e sobrio", previewStyle: finishStyle("#91989f", "rgba(255,255,255,0.38)") },
];

const SANITARY_COLOR_OPTIONS: VisualOption[] = [
  { value: "bianco", label: "Bianco", hint: "Classico", previewStyle: solidStyle("#fbfbfa") },
  { value: "grigio_chiaro", label: "Grigio chiaro", hint: "Soft", previewStyle: solidStyle("#d7dade") },
  { value: "nero_opaco", label: "Nero opaco", hint: "Strong look", previewStyle: solidStyle("#17181c", "rgba(255,255,255,0.1)") },
];

const MIRROR_OPTIONS = [
  { value: "retroilluminato", label: "Retroilluminato" },
  { value: "specchiera_contenitore", label: "Specchiera contenitore" },
  { value: "tondo", label: "Tondo" },
  { value: "verticale", label: "Verticale" },
];

const FLUSH_PLATE_OPTIONS = [
  { value: "rettangolare_sottile", label: "Rettangolare sottile" },
  { value: "vetro_minimal", label: "Vetro minimal" },
  { value: "tonda_soft", label: "Tonda soft" },
];

const QUICK_PAINT_PRESETS = [
  { label: "Bianco caldo", value: "#F5F5F0" },
  { label: "Greige", value: "#D7CFC3" },
  { label: "Sabbia", value: "#D9C6A5" },
  { label: "Salvia", value: "#AAB8A1" },
  { label: "Blu polvere", value: "#9FAFC4" },
  { label: "Antracite", value: "#4A4E55" },
];

const INTERVENTO_OPTIONS: { value: TipoIntervento; label: string; desc: string }[] = [
  { value: "restyling_piastrelle", label: "Restyling piastrelle", desc: "Cambia superfici mantenendo il resto quasi invariato" },
  { value: "restyling_completo", label: "Restyling completo", desc: "Stesso bagno, look completamente rinnovato" },
  { value: "demolizione_parziale", label: "Demolizione parziale", desc: "Modifiche piu profonde solo in alcune zone" },
  { value: "demolizione_completa", label: "Demolizione completa", desc: "Rifacimento totale con layout rivisto" },
];

const TILE_FORMATS = [
  { value: "30x30", label: "30x30 cm" },
  { value: "30x60", label: "30x60 cm" },
  { value: "60x60", label: "60x60 cm" },
  { value: "60x120", label: "60x120 cm" },
  { value: "80x80", label: "80x80 cm" },
  { value: "120x120", label: "120x120 cm" },
  { value: "120x240", label: "120x240 cm (lastra)" },
  { value: "15x90", label: "15x90 cm (listoncino)" },
  { value: "20x120", label: "20x120 cm (listoncino)" },
];

const POSA_OPTIONS = [
  { value: "dritta", label: "Dritta (griglia)" },
  { value: "sfalsata", label: "Sfalsata (mattone)" },
  { value: "diagonale", label: "Diagonale 45°" },
  { value: "spina_pesce", label: "Spina di pesce" },
  { value: "spina_ungherese", label: "Spina ungherese" },
  { value: "chevron", label: "Chevron" },
  { value: "casuale", label: "Casuale / mista" },
];

interface Props {
  value: BathroomConfig;
  onChange: (config: BathroomConfig) => void;
}

function findVisualOption(options: VisualOption[], current: string): VisualOption {
  return options.find((option) => option.value === current) ?? {
    value: current,
    label: current.replace(/_/g, " "),
    hint: "Anteprima materiale selezionato",
    previewStyle: solidStyle("#d7d7d7"),
  };
}

function VisualOptionGrid(props: {
  label: string;
  helper?: string;
  options: VisualOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { label, helper, options, value, onChange } = props;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs">{label}</Label>
        {helper ? <span className="text-[11px] text-muted-foreground">{helper}</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                "group relative overflow-hidden rounded-xl border text-left transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                selected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border/70 hover:border-primary/40 hover:bg-muted/40",
              )}
            >
              <div
                className="h-16 w-full border-b border-black/5"
                style={option.previewStyle}
                aria-hidden="true"
              />
              <div className="space-y-1 px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium leading-tight">{option.label}</span>
                  {selected ? <Check className="mt-0.5 h-3.5 w-3.5 text-primary" /> : null}
                </div>
                {option.hint ? (
                  <p className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">
                    {option.hint}
                  </p>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BathroomMoodPreview({ value }: { value: BathroomConfig }) {
  const wallOption = findVisualOption(TILE_EFFECTS, value.piastrelle_parete.effetto);
  const floorOption = findVisualOption(TILE_EFFECTS, value.pavimento.effetto);
  const vanityTop = findVisualOption(VANITY_TOP_OPTIONS, value.vanity.piano);
  const faucetFinish = findVisualOption(FAUCET_FINISH_OPTIONS, value.rubinetteria.finitura);
  const sanitaryColor = findVisualOption(SANITARY_COLOR_OPTIONS, value.sanitari.colore);
  const wallPaint = value.parete.colore_hex || "#F5F5F0";

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-muted/30 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Anteprima look bagno</p>
          <p className="text-xs text-muted-foreground">
            Visuale rapida dei materiali scelti. Il render finale manterra stanza, taglio foto e proporzioni originali.
          </p>
        </div>
        <div className="rounded-full bg-cyan-500/10 px-3 py-1 text-[11px] font-medium text-cyan-700 dark:text-cyan-300">
          Stesso bagno, look nuovo
        </div>
      </div>

      <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm">
          <div className="relative aspect-[16/10]">
            <div className="absolute inset-x-0 top-0 h-[64%]" style={value.sostituzione.piastrelle_parete ? wallOption.previewStyle : solidStyle(wallPaint)} />
            <div className="absolute inset-x-0 bottom-0 h-[36%]" style={value.sostituzione.pavimento ? floorOption.previewStyle : cementStyle("#b6b6b3", "rgba(100,100,96,0.16)")} />
            <div className="absolute left-1/2 top-[15%] h-[49%] w-px bg-black/10" />
            <div className="absolute left-[9%] top-[20%] h-[17%] w-[16%] rounded-lg border border-white/70 bg-white/75 shadow-sm" />
            <div className="absolute left-[11%] top-[23%] h-[11%] w-[12%] rounded-sm bg-white/90 shadow-inner" />

            <div className="absolute bottom-[17%] left-[11%] h-[24%] w-[30%] rounded-t-2xl border border-black/5 shadow-lg" style={value.sostituzione.mobile_bagno ? solidStyle(value.vanity.colore || "#ffffff") : solidStyle("#ede7df")}>
              <div className="absolute inset-x-[8%] top-0 h-[26%] rounded-t-[14px]" style={value.sostituzione.mobile_bagno ? vanityTop.previewStyle : marbleStyle("#efefef", "rgba(130,130,130,0.18)", "rgba(190,190,190,0.15)")} />
              <div className="absolute left-[30%] top-[8%] h-[18%] w-[40%] rounded-[999px] border border-black/10 bg-white/90" />
              <div className="absolute left-[17%] top-[44%] h-[4%] w-[66%] rounded-full bg-black/8" />
            </div>

            <div className="absolute bottom-[22%] right-[14%] h-[30%] w-[18%] rounded-t-[32px] border border-black/8 shadow-md" style={value.sostituzione.sanitari ? sanitaryColor.previewStyle : solidStyle("#fbfbfa")} />
            <div className="absolute bottom-[22%] right-[34%] h-[26%] w-[14%] rounded-t-[18px] border border-black/8 shadow-sm" style={value.sostituzione.sanitari ? sanitaryColor.previewStyle : solidStyle("#fbfbfa")} />
            {value.sostituzione.sanitari && value.sanitari.azione_wc === "sostituisci" && (value.sanitari.tipo_wc === "sospeso" || value.sanitari.tipo_wc === "rimless_sospeso") ? (
              <div className="absolute bottom-[56%] right-[17%] h-[3.5%] w-[9%] rounded-[6px] border border-black/10 bg-white/90 shadow-sm" />
            ) : null}

            <div className="absolute right-[6%] top-[14%] h-[48%] w-[28%] rounded-[22px] border border-white/70 bg-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4)] backdrop-blur-[1px]" />
            <div className="absolute right-[31%] top-[16%] h-[44%] w-1 rounded-full" style={value.sostituzione.rubinetteria ? faucetFinish.previewStyle : finishStyle("#cfd5dc", "rgba(255,255,255,0.72)")} />
            <div className="absolute right-[32.5%] top-[15%] h-[4%] w-[7%] rounded-full" style={value.sostituzione.rubinetteria ? faucetFinish.previewStyle : finishStyle("#cfd5dc", "rgba(255,255,255,0.72)")} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Parete</p>
            <p className="text-sm font-semibold">{wallOption.label}</p>
            <p className="text-[11px] text-muted-foreground">{wallOption.hint}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pavimento</p>
            <p className="text-sm font-semibold">{floorOption.label}</p>
            <p className="text-[11px] text-muted-foreground">{floorOption.hint}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Punti forti</p>
            <ul className="space-y-1 text-[11px] text-muted-foreground">
              <li>- Il render deve mantenere lo stesso bagno e la stessa inquadratura.</li>
              <li>- Le modifiche riguardano solo gli elementi che attivi qui sotto.</li>
              <li>- Anche una foto verticale deve restare verticale nel risultato.</li>
              <li>- Se scegli 120x240, il render deve leggere poche fughe e lastre davvero grandi.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BathroomConfigForm({ value, onChange }: Props) {
  const update = (partial: Partial<BathroomConfig>) => onChange({ ...value, ...partial });

  return (
    <div className="space-y-5">
      <BathroomMoodPreview value={value} />

      <div>
        <Label className="mb-2 block text-sm font-semibold">Tipo intervento</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {INTERVENTO_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cn(
                "rounded-xl border px-3 py-3 text-left transition-all",
                value.tipo_intervento === opt.value
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border/70 hover:border-primary/30 hover:bg-muted/30",
              )}
              onClick={() => update({ tipo_intervento: opt.value })}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{opt.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{opt.desc}</p>
                </div>
                {value.tipo_intervento === opt.value ? (
                  <span className="rounded-full bg-primary/10 p-1 text-primary">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </div>

      <Accordion type="multiple" defaultValue={["piastrelle_parete", "pavimento"]} className="space-y-2">
        <AccordionItem value="piastrelle_parete" className="rounded-xl border px-3">
          <div className="flex items-center gap-2 py-2.5">
            <Switch
              checked={value.sostituzione.piastrelle_parete}
              onCheckedChange={(checked) =>
                update({
                  sostituzione: { ...value.sostituzione, piastrelle_parete: checked },
                  piastrelle_parete: { ...value.piastrelle_parete, attivo: checked },
                })
              }
            />
            <AccordionTrigger className="flex-1 py-0 text-sm">
              <span>Piastrelle parete</span>
            </AccordionTrigger>
          </div>
          <AccordionContent className="space-y-3 pb-4">
            <VisualOptionGrid
              label="Effetto"
              helper="Tocca il materiale per vedere subito il mood"
              options={TILE_EFFECTS}
              value={value.piastrelle_parete.effetto}
              onChange={(effect) =>
                update({ piastrelle_parete: { ...value.piastrelle_parete, effetto: effect } })
              }
            />
            <div>
              <Label className="text-xs">Formato</Label>
              <Select
                value={value.piastrelle_parete.formato}
                onValueChange={(format) =>
                  update({ piastrelle_parete: { ...value.piastrelle_parete, formato: format } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TILE_FORMATS.map((format) => (
                    <SelectItem key={format.value} value={format.value}>{format.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                I formati grandi come 120x240 devono risultare come lastre con pochissime fughe visibili.
              </p>
            </div>
            <div>
              <Label className="text-xs">Posa</Label>
              <Select
                value={value.piastrelle_parete.posa}
                onValueChange={(posa) =>
                  update({ piastrelle_parete: { ...value.piastrelle_parete, posa } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POSA_OPTIONS.map((posa) => (
                    <SelectItem key={posa.value} value={posa.value}>{posa.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Colore fuga</Label>
              <Input
                value={value.piastrelle_parete.fuga_colore}
                onChange={(event) =>
                  update({ piastrelle_parete: { ...value.piastrelle_parete, fuga_colore: event.target.value } })
                }
                placeholder="es. grigio chiaro"
              />
            </div>
            <div>
              <Label className="text-xs">Altezza rivestimento</Label>
              <Select
                value={value.piastrelle_parete.altezza_rivestimento || "fino al soffitto"}
                onValueChange={(height) =>
                  update({ piastrelle_parete: { ...value.piastrelle_parete, altezza_rivestimento: height } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="120cm">120 cm</SelectItem>
                  <SelectItem value="150cm">150 cm</SelectItem>
                  <SelectItem value="200cm">200 cm</SelectItem>
                  <SelectItem value="fino al soffitto">Fino al soffitto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="pavimento" className="rounded-xl border px-3">
          <div className="flex items-center gap-2 py-2.5">
            <Switch
              checked={value.sostituzione.pavimento}
              onCheckedChange={(checked) =>
                update({
                  sostituzione: { ...value.sostituzione, pavimento: checked },
                  pavimento: { ...value.pavimento, attivo: checked },
                })
              }
            />
            <AccordionTrigger className="flex-1 py-0 text-sm">
              <span>Pavimento</span>
            </AccordionTrigger>
          </div>
          <AccordionContent className="space-y-3 pb-4">
            <VisualOptionGrid
              label="Effetto"
              helper="Così capisci subito il carattere del nuovo pavimento"
              options={TILE_EFFECTS}
              value={value.pavimento.effetto}
              onChange={(effect) =>
                update({ pavimento: { ...value.pavimento, effetto: effect } })
              }
            />
            <div>
              <Label className="text-xs">Formato</Label>
              <Select
                value={value.pavimento.formato}
                onValueChange={(format) =>
                  update({ pavimento: { ...value.pavimento, formato: format } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TILE_FORMATS.map((format) => (
                    <SelectItem key={format.value} value={format.value}>{format.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Su pavimento il formato scelto deve restare leggibile: grande formato = giunti radi e campi ampi.
              </p>
            </div>
            <div>
              <Label className="text-xs">Posa</Label>
              <Select
                value={value.pavimento.posa}
                onValueChange={(posa) =>
                  update({ pavimento: { ...value.pavimento, posa } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POSA_OPTIONS.map((posa) => (
                    <SelectItem key={posa.value} value={posa.value}>{posa.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Colore fuga</Label>
              <Input
                value={value.pavimento.fuga_colore}
                onChange={(event) =>
                  update({ pavimento: { ...value.pavimento, fuga_colore: event.target.value } })
                }
                placeholder="es. grigio"
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="doccia" className="rounded-xl border px-3">
          <div className="flex items-center gap-2 py-2.5">
            <Switch
              checked={value.sostituzione.doccia}
              onCheckedChange={(checked) =>
                update({
                  sostituzione: { ...value.sostituzione, doccia: checked },
                  doccia: { ...value.doccia, attivo: checked },
                })
              }
            />
            <AccordionTrigger className="flex-1 py-0 text-sm">
              <span>Doccia</span>
            </AccordionTrigger>
          </div>
          <AccordionContent className="space-y-3 pb-4">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select
                value={value.doccia.tipo}
                onValueChange={(type) =>
                  update({ doccia: { ...value.doccia, tipo: type as BathroomConfig["doccia"]["tipo"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="walk_in">Walk-in</SelectItem>
                  <SelectItem value="nicchia_box">Box nicchia</SelectItem>
                  <SelectItem value="frontale_box">Box frontale</SelectItem>
                  <SelectItem value="angolare">Angolare</SelectItem>
                  <SelectItem value="semicircolare">Semicircolare</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Vetro box</Label>
              <Select
                value={value.doccia.box_vetro}
                onValueChange={(glass) =>
                  update({ doccia: { ...value.doccia, box_vetro: glass as BathroomConfig["doccia"]["box_vetro"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trasparente">Trasparente</SelectItem>
                  <SelectItem value="satinato">Satinato</SelectItem>
                  <SelectItem value="fume">Fume</SelectItem>
                  <SelectItem value="serigrafato">Serigrafato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Piatto doccia</Label>
              <Select
                value={value.doccia.piatto}
                onValueChange={(tray) =>
                  update({ doccia: { ...value.doccia, piatto: tray as BathroomConfig["doccia"]["piatto"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="filo_pavimento">Filo pavimento</SelectItem>
                  <SelectItem value="rialzato_3cm">Rialzato 3 cm</SelectItem>
                  <SelectItem value="rialzato_5cm">Rialzato 5 cm</SelectItem>
                  <SelectItem value="pietra">Pietra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Profilo</Label>
              <Select
                value={value.doccia.profilo}
                onValueChange={(profile) =>
                  update({ doccia: { ...value.doccia, profilo: profile as BathroomConfig["doccia"]["profilo"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cromato">Cromato</SelectItem>
                  <SelectItem value="nero_opaco">Nero opaco</SelectItem>
                  <SelectItem value="oro_spazzolato">Oro spazzolato</SelectItem>
                  <SelectItem value="senza_profilo">Senza profilo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Soffione</Label>
              <Select
                value={value.doccia.soffione}
                onValueChange={(showerhead) =>
                  update({ doccia: { ...value.doccia, soffione: showerhead as BathroomConfig["doccia"]["soffione"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a_parete">A parete</SelectItem>
                  <SelectItem value="pioggia_soffitto">Pioggia soffitto</SelectItem>
                  <SelectItem value="colonna_completa">Colonna completa</SelectItem>
                  <SelectItem value="combinato">Combinato</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="vasca" className="rounded-xl border px-3">
          <div className="flex items-center gap-2 py-2.5">
            <Switch
              checked={value.sostituzione.vasca}
              onCheckedChange={(checked) =>
                update({
                  sostituzione: { ...value.sostituzione, vasca: checked },
                  vasca: { ...value.vasca, attivo: checked },
                })
              }
            />
            <AccordionTrigger className="flex-1 py-0 text-sm">
              <span>Vasca</span>
            </AccordionTrigger>
          </div>
          <AccordionContent className="space-y-3 pb-4">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select
                value={value.vasca.tipo}
                onValueChange={(type) =>
                  update({ vasca: { ...value.vasca, tipo: type as BathroomConfig["vasca"]["tipo"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="freestanding_ovale">Freestanding ovale</SelectItem>
                  <SelectItem value="freestanding_rettangolare">Freestanding rettangolare</SelectItem>
                  <SelectItem value="back_to_wall">Back-to-wall</SelectItem>
                  <SelectItem value="incassata">Incassata</SelectItem>
                  <SelectItem value="angolare">Angolare</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Materiale</Label>
              <Select
                value={value.vasca.materiale}
                onValueChange={(material) =>
                  update({ vasca: { ...value.vasca, materiale: material as BathroomConfig["vasca"]["materiale"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="acrilico_bianco">Acrilico bianco</SelectItem>
                  <SelectItem value="solid_surface">Solid surface</SelectItem>
                  <SelectItem value="ghisa_smaltata">Ghisa smaltata</SelectItem>
                  <SelectItem value="pietra">Pietra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Rubinetteria vasca</Label>
              <Select
                value={value.vasca.rubinetteria_vasca}
                onValueChange={(tap) =>
                  update({ vasca: { ...value.vasca, rubinetteria_vasca: tap as BathroomConfig["vasca"]["rubinetteria_vasca"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a_parete">A parete</SelectItem>
                  <SelectItem value="a_pavimento">A pavimento</SelectItem>
                  <SelectItem value="bordo_vasca">Bordo vasca</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="mobile_bagno" className="rounded-xl border px-3">
          <div className="flex items-center gap-2 py-2.5">
            <Switch
              checked={value.sostituzione.mobile_bagno}
              onCheckedChange={(checked) =>
                update({
                  sostituzione: { ...value.sostituzione, mobile_bagno: checked },
                  vanity: { ...value.vanity, attivo: checked },
                })
              }
            />
            <AccordionTrigger className="flex-1 py-0 text-sm">
              <span>Mobile bagno</span>
            </AccordionTrigger>
          </div>
          <AccordionContent className="space-y-3 pb-4">
            <div>
              <Label className="text-xs">Stile</Label>
              <Select
                value={value.vanity.stile}
                onValueChange={(style) =>
                  update({ vanity: { ...value.vanity, stile: style as BathroomConfig["vanity"]["stile"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sospeso_moderno">Sospeso moderno</SelectItem>
                  <SelectItem value="sospeso_minimal">Sospeso minimal</SelectItem>
                  <SelectItem value="a_terra_classico">A terra classico</SelectItem>
                  <SelectItem value="a_terra_industrial">A terra industrial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Colore mobile</Label>
              <Input
                value={value.vanity.colore}
                onChange={(event) =>
                  update({ vanity: { ...value.vanity, colore: event.target.value } })
                }
                placeholder="es. bianco opaco, rovere naturale"
              />
            </div>
            <VisualOptionGrid
              label="Piano"
              helper="Anteprima rapida del top del mobile bagno"
              options={VANITY_TOP_OPTIONS}
              value={value.vanity.piano}
              onChange={(top) =>
                update({ vanity: { ...value.vanity, piano: top as BathroomConfig["vanity"]["piano"] } })
              }
            />
            <div>
              <Label className="text-xs">Lavabo</Label>
              <Select
                value={value.vanity.lavabo}
                onValueChange={(basin) =>
                  update({ vanity: { ...value.vanity, lavabo: basin as BathroomConfig["vanity"]["lavabo"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="integrato">Integrato</SelectItem>
                  <SelectItem value="appoggio_ovale">Appoggio ovale</SelectItem>
                  <SelectItem value="appoggio_rettangolare">Appoggio rettangolare</SelectItem>
                  <SelectItem value="semincasso">Semincasso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Larghezza (cm)</Label>
              <Select
                value={String(value.vanity.larghezza_cm)}
                onValueChange={(width) =>
                  update({ vanity: { ...value.vanity, larghezza_cm: Number(width) as BathroomConfig["vanity"]["larghezza_cm"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">60 cm</SelectItem>
                  <SelectItem value="80">80 cm</SelectItem>
                  <SelectItem value="100">100 cm</SelectItem>
                  <SelectItem value="120">120 cm</SelectItem>
                  <SelectItem value="140">140 cm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Numero lavabi</Label>
              <Select
                value={String(value.vanity.numero_lavabi || 1)}
                onValueChange={(count) =>
                  update({ vanity: { ...value.vanity, numero_lavabi: Number(count) as 1 | 2 } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Singolo lavabo</SelectItem>
                  <SelectItem value="2">Doppio lavabo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Specchio</Label>
              <Select
                value={value.vanity.specchio || "retroilluminato"}
                onValueChange={(mirror) =>
                  update({ vanity: { ...value.vanity, specchio: mirror as NonNullable<BathroomConfig["vanity"]["specchio"]> } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MIRROR_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="sanitari" className="rounded-xl border px-3">
          <div className="flex items-center gap-2 py-2.5">
            <Switch
              checked={value.sostituzione.sanitari}
              onCheckedChange={(checked) =>
                update({
                  sostituzione: { ...value.sostituzione, sanitari: checked },
                  sanitari: { ...value.sanitari, attivo: checked },
                })
              }
            />
            <AccordionTrigger className="flex-1 py-0 text-sm">
              <span>Sanitari</span>
            </AccordionTrigger>
          </div>
          <AccordionContent className="space-y-3 pb-4">
            <div>
              <Label className="text-xs">WC</Label>
              <Select
                value={value.sanitari.azione_wc}
                onValueChange={(action) =>
                  update({ sanitari: { ...value.sanitari, azione_wc: action as BathroomConfig["sanitari"]["azione_wc"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mantieni">Mantieni attuale</SelectItem>
                  <SelectItem value="sostituisci">Sostituisci</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {value.sanitari.azione_wc === "sostituisci" ? (
              <>
                <div>
                  <Label className="text-xs">Tipo WC</Label>
                  <Select
                    value={value.sanitari.tipo_wc}
                    onValueChange={(type) =>
                      update({ sanitari: { ...value.sanitari, tipo_wc: type as BathroomConfig["sanitari"]["tipo_wc"] } })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sospeso">Sospeso</SelectItem>
                      <SelectItem value="a_terra">A terra</SelectItem>
                      <SelectItem value="rimless_sospeso">Rimless sospeso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {value.sanitari.tipo_wc === "sospeso" || value.sanitari.tipo_wc === "rimless_sospeso" ? (
                  <div>
                    <Label className="text-xs">Piastra WC a parete</Label>
                    <Select
                      value={value.sanitari.piastra_wc || "rettangolare_sottile"}
                      onValueChange={(plate) =>
                        update({ sanitari: { ...value.sanitari, piastra_wc: plate as NonNullable<BathroomConfig["sanitari"]["piastra_wc"]> } })
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FLUSH_PLATE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Nei WC sospesi chiediamo cassetta da incasso e piastra compatta, non il vecchio serbatoio a vista.
                    </p>
                  </div>
                ) : null}
              </>
            ) : null}
            <div>
              <Label className="text-xs">Bidet</Label>
              <Select
                value={value.sanitari.azione_bidet}
                onValueChange={(action) =>
                  update({ sanitari: { ...value.sanitari, azione_bidet: action as BathroomConfig["sanitari"]["azione_bidet"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mantieni">Mantieni attuale</SelectItem>
                  <SelectItem value="sostituisci">Sostituisci</SelectItem>
                  <SelectItem value="rimuovi">Rimuovi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {value.sanitari.azione_bidet === "sostituisci" ? (
              <div>
                <Label className="text-xs">Tipo bidet</Label>
                <Select
                  value={value.sanitari.tipo_bidet || "sospeso"}
                  onValueChange={(type) =>
                    update({ sanitari: { ...value.sanitari, tipo_bidet: type as "sospeso" | "a_terra" } })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sospeso">Sospeso</SelectItem>
                    <SelectItem value="a_terra">A terra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <VisualOptionGrid
              label="Colore sanitari"
              options={SANITARY_COLOR_OPTIONS}
              value={value.sanitari.colore}
              onChange={(color) =>
                update({ sanitari: { ...value.sanitari, colore: color as BathroomConfig["sanitari"]["colore"] } })
              }
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="rubinetteria" className="rounded-xl border px-3">
          <div className="flex items-center gap-2 py-2.5">
            <Switch
              checked={value.sostituzione.rubinetteria}
              onCheckedChange={(checked) =>
                update({
                  sostituzione: { ...value.sostituzione, rubinetteria: checked },
                  rubinetteria: { ...value.rubinetteria, attivo: checked },
                })
              }
            />
            <AccordionTrigger className="flex-1 py-0 text-sm">
              <span>Rubinetteria</span>
            </AccordionTrigger>
          </div>
          <AccordionContent className="space-y-3 pb-4">
            <VisualOptionGrid
              label="Finitura"
              helper="Così la rubinetteria resta coerente in tutto il bagno"
              options={FAUCET_FINISH_OPTIONS}
              value={value.rubinetteria.finitura}
              onChange={(finish) =>
                update({ rubinetteria: { ...value.rubinetteria, finitura: finish as BathroomConfig["rubinetteria"]["finitura"] } })
              }
            />
            <div>
              <Label className="text-xs">Stile</Label>
              <Select
                value={value.rubinetteria.stile}
                onValueChange={(style) =>
                  update({ rubinetteria: { ...value.rubinetteria, stile: style as BathroomConfig["rubinetteria"]["stile"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="quadro_moderno">Quadro moderno</SelectItem>
                  <SelectItem value="tondo_classico">Tondo classico</SelectItem>
                  <SelectItem value="industrial">Industrial</SelectItem>
                  <SelectItem value="vintage_crosshead">Vintage crosshead</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="parete_colore" className="rounded-xl border px-3">
          <div className="flex items-center gap-2 py-2.5">
            <Switch
              checked={value.sostituzione.parete_colore}
              onCheckedChange={(checked) =>
                update({
                  sostituzione: { ...value.sostituzione, parete_colore: checked },
                  parete: { ...value.parete, attivo: checked },
                })
              }
            />
            <AccordionTrigger className="flex-1 py-0 text-sm">
              <span>Pareti non piastrellate</span>
            </AccordionTrigger>
          </div>
          <AccordionContent className="space-y-3 pb-4">
            <div>
              <Label className="text-xs">Azione</Label>
              <Select
                value={value.parete.azione}
                onValueChange={(action) =>
                  update({ parete: { ...value.parete, azione: action as BathroomConfig["parete"]["azione"] } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mantieni">Mantieni</SelectItem>
                  <SelectItem value="tinta_unita">Tinta unita</SelectItem>
                  <SelectItem value="lastra_decorativa">Lastra decorativa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {value.parete.azione === "tinta_unita" || value.parete.azione === "lastra_decorativa" ? (
              <>
                <div>
                  <Label className="text-xs">Preset colore rapidi</Label>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {QUICK_PAINT_PRESETS.map((preset) => {
                      const selected = (value.parete.colore_hex || "#F5F5F0").toLowerCase() === preset.value.toLowerCase();
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          className={cn(
                            "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all",
                            selected ? "border-primary bg-primary/5" : "border-border/70 hover:border-primary/30 hover:bg-muted/30",
                          )}
                          onClick={() => update({ parete: { ...value.parete, colore_hex: preset.value } })}
                        >
                          <span className="h-6 w-6 rounded-full border border-black/10" style={{ backgroundColor: preset.value }} />
                          <span className="text-xs font-medium">{preset.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Colore</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={value.parete.colore_hex || "#F5F5F0"}
                      onChange={(event) =>
                        update({ parete: { ...value.parete, colore_hex: event.target.value } })
                      }
                      className="h-10 w-10 cursor-pointer rounded border"
                    />
                    <Input
                      value={value.parete.colore_hex || "#F5F5F0"}
                      onChange={(event) =>
                        update({ parete: { ...value.parete, colore_hex: event.target.value } })
                      }
                      className="flex-1"
                      placeholder="#F5F5F0"
                    />
                  </div>
                </div>
              </>
            ) : null}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div>
        <Label className="text-xs font-semibold">Note libere</Label>
        <Textarea
          value={value.note_libere || ""}
          onChange={(event) => update({ note_libere: event.target.value })}
          placeholder="Indicazioni aggiuntive per l'AI, ad esempio: 'mantieni il bagno molto luminoso', 'stile hotel di lusso ma realistico', 'niente elementi decorativi extra'."
          rows={4}
          className="mt-1"
        />
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100">
        <p className="font-semibold">Come ragiona il render</p>
        <p className="mt-1 text-emerald-900/80 dark:text-emerald-100/80">
          Se scegli una doccia walk-in, il sistema forza una vera walk-in aperta. Se selezioni una vasca al posto della doccia, la doccia esistente viene rimossa. Se cambi solo una superficie, il resto deve rimanere coerente con il bagno originale.
        </p>
      </div>
    </div>
  );
}
