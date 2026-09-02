import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowDownUp,
  Blinds,
  BookOpen,
  DoorClosed,
  Frame,
  Grid3X3,
  Paintbrush,
  PanelLeftClose,
  PlusCircle,
  Replace,
  ShieldCheck,
  SunDim,
  Trash2,
} from "lucide-react";

import type {
  AnalisiPersiane,
  AperturaLamelle,
  ConfigurazionePersiane,
  MaterialePersiana,
  PersianaFerramentaFinitura,
  PersianaInstallazione,
  StatoApertura,
  TipoOperazione,
  TipoPersiana,
} from "@/modules/render-persiane/lib/types";
import { TIPI_CON_LAMELLE } from "@/modules/render-persiane/lib/types";

const OPERAZIONI: { value: TipoOperazione; label: string; desc: string; icon: typeof Replace }[] = [
  { value: "sostituisci", label: "Sostituisci", desc: "Cambia il sistema oscurante mantenendo la stessa facciata", icon: Replace },
  { value: "cambia_colore", label: "Cambia colore", desc: "Mantieni geometria e ferramenta, cambia solo finitura", icon: Paintbrush },
  { value: "aggiungi", label: "Aggiungi", desc: "Installa nuove persiane dove oggi non ci sono", icon: PlusCircle },
  { value: "rimuovi", label: "Rimuovi", desc: "Elimina persiane e accessori con ripristino credibile", icon: Trash2 },
];

const TIPI_PERSIANA: { value: TipoPersiana; label: string; icon: typeof PanelLeftClose; desc: string }[] = [
  { value: "veneziana_classica", label: "Veneziana classica", icon: PanelLeftClose, desc: "Lamelle tradizionali e look residenziale classico" },
  { value: "veneziana_esterna", label: "Veneziana esterna", icon: Blinds, desc: "Sistema più tecnico con guide e linguaggio contemporaneo" },
  { value: "scuro_pieno", label: "Scuro pieno", icon: DoorClosed, desc: "Pannello pieno senza lamelle" },
  { value: "scuro_cornice", label: "Scuro a cornice", icon: Frame, desc: "Pannellatura più classica e decorativa" },
  { value: "gelosia", label: "Gelosia", icon: Grid3X3, desc: "Lamelle fisse per privacy e ventilazione" },
  { value: "avvolgibile_esterno", label: "Avvolgibile", icon: ArrowDownUp, desc: "Tapparella con guide e logica da avvolgibile reale" },
  { value: "a_libro", label: "A libro", icon: BookOpen, desc: "Pannelli pieghevoli con impacchettamento visibile" },
  { value: "griglia_sicurezza", label: "Griglia sicurezza", icon: ShieldCheck, desc: "Sistema metallico protettivo vero, non decorativo" },
  { value: "brise_soleil", label: "Brise-soleil", icon: SunDim, desc: "Schermatura architettonica contemporanea" },
];

const MATERIALI: { value: MaterialePersiana; label: string; desc: string }[] = [
  { value: "legno_naturale", label: "Legno naturale", desc: "Più caldo e materico" },
  { value: "legno_composito", label: "Legno composito", desc: "Aspetto regolare e meno manutenzione" },
  { value: "alluminio", label: "Alluminio", desc: "Profili netti e resa tecnica" },
  { value: "pvc", label: "PVC", desc: "Superficie uniforme e pulita" },
  { value: "acciaio", label: "Acciaio", desc: "Più robusto e strutturale" },
  { value: "fibra_vetro", label: "Fibra di vetro", desc: "Tecnico e stabile all'esterno" },
];

const RAL_QUICK_COLORS = [
  { ral: "9010", nome: "Bianco puro", hex: "#F7F5EF" },
  { ral: "7016", nome: "Grigio antracite", hex: "#383E42" },
  { ral: "6005", nome: "Verde muschio", hex: "#0F4336" },
  { ral: "8017", nome: "Marrone cioccolato", hex: "#44322D" },
  { ral: "1013", nome: "Bianco perla", hex: "#E3D9C6" },
  { ral: "9005", nome: "Nero intenso", hex: "#101215" },
];

const EFFETTI_LEGNO = [
  { value: "rovere_chiaro", label: "Rovere chiaro", swatch: "linear-gradient(135deg, #d6bc95, #b08c62)" },
  { value: "rovere_scuro", label: "Rovere scuro", swatch: "linear-gradient(135deg, #7e6043, #4b3524)" },
  { value: "noce_nazionale", label: "Noce nazionale", swatch: "linear-gradient(135deg, #9f7652, #65422d)" },
  { value: "castagno", label: "Castagno", swatch: "linear-gradient(135deg, #a07249, #6b492f)" },
  { value: "douglas", label: "Douglas", swatch: "linear-gradient(135deg, #b88756, #7b5536)" },
];

const STATI_APERTURA: { value: StatoApertura; label: string; desc: string }[] = [
  { value: "chiuso", label: "Chiuso", desc: "Sistema raccolto in posizione chiusa" },
  { value: "socchiuso", label: "Socchiuso", desc: "Piccolo angolo di apertura" },
  { value: "aperto_45", label: "Aperto 45°", desc: "Apertura intermedia leggibile" },
  { value: "aperto_90", label: "Aperto 90°", desc: "Aperto completamente verso la parete" },
  { value: "anta_singola_aperta", label: "Anta singola aperta", desc: "Configurazione asimmetrica" },
];

const APERTURE_LAMELLE: { value: AperturaLamelle; label: string }[] = [
  { value: "chiuse", label: "Chiuse" },
  { value: "parzialmente_aperte", label: "Parzialmente aperte" },
  { value: "completamente_aperte", label: "Completamente aperte" },
];

const FERRAMENTA_FINISH: { value: PersianaFerramentaFinitura; label: string }[] = [
  { value: "verniciata_tinta", label: "In tinta" },
  { value: "nero_opaco", label: "Nero opaco" },
  { value: "acciaio_satinato", label: "Acciaio satinato" },
  { value: "ferro_micaceo", label: "Ferro micaceo" },
  { value: "bronzo_scuro", label: "Bronzo scuro" },
];

const INSTALLAZIONI: { value: PersianaInstallazione; label: string }[] = [
  { value: "cardini_tradizionali", label: "Cardini tradizionali" },
  { value: "su_telaio", label: "Su telaio / in vano" },
  { value: "guide_laterali", label: "Guide laterali" },
  { value: "brackets_architettonici", label: "Supporti architettonici" },
];

interface Props {
  value: ConfigurazionePersiane;
  onChange: (v: ConfigurazionePersiane) => void;
  disabled?: boolean;
  analysis?: AnalisiPersiane | null;
}

function openingShortLabel(type: string) {
  return type.replace(/_/g, " ");
}

export function PersianeConfigForm({ value, onChange, disabled, analysis }: Props) {
  const set = <K extends keyof ConfigurazionePersiane>(key: K, val: ConfigurazionePersiane[K]) =>
    onChange({ ...value, [key]: val });

  const showFullConfig = value.operazione !== "rimuovi";
  const showColorOnly = value.operazione === "cambia_colore";
  const showLamelle = TIPI_CON_LAMELLE.has(value.tipo) && showFullConfig;
  const openings = analysis?.openings ?? [];
  const canSelectSpecificOpenings = openings.length > 1;
  const selectedIds = value.selected_opening_ids ?? [];

  const toggleOpening = (openingId: string) => {
    const next = selectedIds.includes(openingId)
      ? selectedIds.filter((id) => id !== openingId)
      : [...selectedIds, openingId];
    onChange({
      ...value,
      target_mode: next.length === 0 ? "main_opening" : "selected_openings",
      applica_tutte_finestre: false,
      selected_opening_ids: next,
    });
  };

  return (
    <div className="space-y-8">
      {analysis && (
        <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Analisi facciata
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="secondary">{analysis.facadeType}</Badge>
              <Badge variant="secondary">{analysis.buildingStyle}</Badge>
              <Badge variant="secondary">{analysis.openingsVisible} aperture visibili</Badge>
              <Badge variant="secondary">{analysis.imageOrientation}</Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {analysis.noteAnalisi}
          </p>
        </div>
      )}

      <div className="space-y-3">
        <Label className="text-sm font-semibold">Aperture target</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...value, applica_tutte_finestre: true, target_mode: "all_visible", selected_opening_ids: [] })}
            className={`rounded-xl border p-3 text-left transition-all ${
              value.target_mode === "all_visible" || value.applica_tutte_finestre
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-slate-300 bg-white shadow-sm hover:border-primary/60 hover:shadow"
            }`}
          >
            <p className="text-sm font-medium">Tutte le aperture</p>
            <p className="text-xs text-muted-foreground mt-1">Applica la stessa trasformazione a tutte le finestre visibili.</p>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...value, applica_tutte_finestre: false, target_mode: "main_opening", selected_opening_ids: [] })}
            className={`rounded-xl border p-3 text-left transition-all ${
              value.target_mode === "main_opening"
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-slate-300 bg-white shadow-sm hover:border-primary/60 hover:shadow"
            }`}
          >
            <p className="text-sm font-medium">Solo apertura principale</p>
            <p className="text-xs text-muted-foreground mt-1">Mantiene tutte le altre aperture intatte.</p>
          </button>
          <button
            type="button"
            disabled={disabled || !canSelectSpecificOpenings}
            onClick={() => onChange({ ...value, applica_tutte_finestre: false, target_mode: "selected_openings", selected_opening_ids: selectedIds.length > 0 ? selectedIds : openings.slice(0, 1).map((opening) => opening.id) })}
            className={`rounded-xl border p-3 text-left transition-all ${
              value.target_mode === "selected_openings"
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-slate-300 bg-white shadow-sm hover:border-primary/60 hover:shadow"
            } ${!canSelectSpecificOpenings ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <p className="text-sm font-medium">Aperture selezionate</p>
            <p className="text-xs text-muted-foreground mt-1">Scegli esattamente quali finestre cambiare.</p>
          </button>
        </div>

        {value.target_mode === "selected_openings" && canSelectSpecificOpenings && (
          <div className="grid gap-2 sm:grid-cols-2">
            {openings.map((opening) => {
              const active = selectedIds.includes(opening.id);
              return (
                <button
                  key={opening.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleOpening(opening.id)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-slate-300 bg-white shadow-sm hover:border-primary/60 hover:shadow"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Apertura {opening.label}</p>
                    <Badge variant={active ? "default" : "outline"}>{opening.position.replace(/_/g, " ")}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {openingShortLabel(opening.existingShutterType)} · {opening.apparentSize}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Operazione</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {OPERAZIONI.map(({ value: opValue, label, desc, icon: Icon }) => (
            <button
              key={opValue}
              type="button"
              disabled={disabled}
              onClick={() => set("operazione", opValue)}
              className={`rounded-xl border p-3 text-left transition-all ${
                value.operazione === opValue
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-slate-300 bg-white shadow-sm hover:border-primary/60 hover:shadow"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 rounded-md p-2 ${value.operazione === opValue ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {showFullConfig && !showColorOnly && (
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Tipologia oscurante</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {TIPI_PERSIANA.map(({ value: shutterType, label, icon: Icon, desc }) => (
              <button
                key={shutterType}
                type="button"
                disabled={disabled}
                onClick={() => {
                  const nextConfig: ConfigurazionePersiane = { ...value, tipo: shutterType };
                  if (TIPI_CON_LAMELLE.has(shutterType) && !value.lamelle) {
                    nextConfig.lamelle = { larghezza_mm: 50, apertura: "chiuse" };
                  }
                  onChange(nextConfig);
                }}
                className={`rounded-xl border p-3 text-left transition-all ${
                  value.tipo === shutterType
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-slate-300 bg-white shadow-sm hover:border-primary/60 hover:shadow"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`rounded-md p-2 ${value.tipo === shutterType ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {showFullConfig && !showColorOnly && (
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Materiale</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {MATERIALI.map((material) => (
              <button
                key={material.value}
                type="button"
                disabled={disabled}
                onClick={() => set("materiale", material.value)}
                className={`rounded-xl border p-3 text-left transition-all ${
                  value.materiale === material.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-slate-300 bg-white shadow-sm hover:border-primary/60 hover:shadow"
                }`}
              >
                <p className="text-sm font-medium">{material.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{material.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {showFullConfig && (
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-semibold">Finitura</Label>
            <p className="text-xs text-muted-foreground mt-1">
              La finitura entra direttamente nel prompt finale del render, quindi qui conviene essere molto precisi.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => set("colore_mode", "ral")}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
                value.colore_mode === "ral"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-slate-300 bg-white text-muted-foreground hover:border-primary/60 hover:text-foreground"
              }`}
            >
              Colore RAL
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => set("colore_mode", "legno")}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
                value.colore_mode === "legno"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-slate-300 bg-white text-muted-foreground hover:border-primary/60 hover:text-foreground"
              }`}
            >
              Effetto legno
            </button>
          </div>

          {value.colore_mode === "ral" ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {RAL_QUICK_COLORS.map((color) => {
                const active = value.colore_ral === color.ral && value.colore_nome === color.nome;
                return (
                  <button
                    key={`${color.ral}-${color.nome}`}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...value,
                        colore_ral: color.ral,
                        colore_nome: color.nome,
                        colore_hex: color.hex,
                      })
                    }
                    className={`rounded-xl border p-3 text-left transition-all ${
                      active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-slate-300 bg-white shadow-sm hover:border-primary/60 hover:shadow"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full border border-black/10" style={{ backgroundColor: color.hex }} />
                      <div>
                        <p className="text-sm font-medium">{color.nome}</p>
                        <p className="text-xs text-muted-foreground">RAL {color.ral}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3">
              {EFFETTI_LEGNO.map((effect) => {
                const active = value.effetto_legno === effect.value;
                return (
                  <button
                    key={effect.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => set("effetto_legno", effect.value)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-slate-300 bg-white shadow-sm hover:border-primary/60 hover:shadow"
                    }`}
                  >
                    <div className="h-10 rounded-lg border border-black/10" style={{ background: effect.swatch }} />
                    <p className="text-sm font-medium mt-3">{effect.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">Usa questo effetto come riferimento materico del render.</p>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="colore_profilo_diverso"
              checked={value.colore_profilo_diverso === true}
              onCheckedChange={(checked) => set("colore_profilo_diverso", checked === true)}
              disabled={disabled}
            />
            <Label htmlFor="colore_profilo_diverso" className="text-sm cursor-pointer">
              Profilo esterno con colore diverso
            </Label>
          </div>

          {value.colore_profilo_diverso && (
            <div className="grid gap-2 sm:grid-cols-3">
              {RAL_QUICK_COLORS.map((color) => {
                const active = value.colore_profilo_hex === color.hex;
                return (
                  <button
                    key={`profilo-${color.hex}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => set("colore_profilo_hex", color.hex)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-slate-300 bg-white shadow-sm hover:border-primary/60 hover:shadow"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-6 w-6 rounded-full border border-black/10" style={{ backgroundColor: color.hex }} />
                      <div>
                        <p className="text-sm font-medium">{color.nome}</p>
                        <p className="text-xs text-muted-foreground">Profilo / telaio</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showFullConfig && (
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Stato apertura</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {STATI_APERTURA.map((state) => (
              <button
                key={state.value}
                type="button"
                disabled={disabled}
                onClick={() => set("stato_apertura", state.value)}
                className={`rounded-xl border p-3 text-left transition-all ${
                  value.stato_apertura === state.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-slate-300 bg-white shadow-sm hover:border-primary/60 hover:shadow"
                }`}
              >
                <p className="text-sm font-medium">{state.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{state.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {showFullConfig && !showColorOnly && showLamelle && (
        <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
          <div>
            <Label className="text-sm font-semibold">Lamelle</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Vale per veneziane, gelosie e schermature a lame.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Larghezza lamelle</Label>
              <Select
                value={String(value.lamelle?.larghezza_mm ?? 50)}
                onValueChange={(nextValue) =>
                  onChange({
                    ...value,
                    lamelle: {
                      ...(value.lamelle ?? { larghezza_mm: 50, apertura: "chiuse" as const }),
                      larghezza_mm: Number(nextValue) as 40 | 50 | 60 | 80,
                    },
                  })
                }
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[40, 50, 60, 80].map((width) => (
                    <SelectItem key={width} value={String(width)}>
                      {width} mm
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Apertura lamelle</Label>
              <Select
                value={value.lamelle?.apertura ?? "chiuse"}
                onValueChange={(nextValue) =>
                  onChange({
                    ...value,
                    lamelle: {
                      ...(value.lamelle ?? { larghezza_mm: 50, apertura: "chiuse" as const }),
                      apertura: nextValue as AperturaLamelle,
                    },
                  })
                }
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APERTURE_LAMELLE.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Label className="text-sm font-semibold">Ferramenta e dettagli</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Finitura ferramenta</Label>
            <Select
              value={value.ferramenta_finitura ?? "verniciata_tinta"}
              onValueChange={(nextValue) => set("ferramenta_finitura", nextValue as PersianaFerramentaFinitura)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FERRAMENTA_FINISH.map((finish) => (
                  <SelectItem key={finish.value} value={finish.value}>
                    {finish.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Logica di installazione</Label>
            <Select
              value={value.installazione ?? (value.tipo === "avvolgibile_esterno" || value.tipo === "veneziana_esterna" ? "guide_laterali" : value.tipo === "brise_soleil" ? "brackets_architettonici" : "cardini_tradizionali")}
              onValueChange={(nextValue) => set("installazione", nextValue as PersianaInstallazione)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INSTALLAZIONI.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-xl border p-3">
            <Checkbox
              id="fermapersiana_visibile"
              checked={value.fermapersiana_visibile === true}
              onCheckedChange={(checked) => set("fermapersiana_visibile", checked === true)}
              disabled={disabled}
            />
            <Label htmlFor="fermapersiana_visibile" className="text-sm cursor-pointer">
              Mostra fermapersiane / accessori di ritenuta se coerenti
            </Label>
          </div>

          <div className="flex items-center gap-2 rounded-xl border p-3">
            <Checkbox
              id="mantieni_accessori_non_target"
              checked={value.mantieni_accessori_non_target !== false}
              onCheckedChange={(checked) => set("mantieni_accessori_non_target", checked === true)}
              disabled={disabled}
            />
            <Label htmlFor="mantieni_accessori_non_target" className="text-sm cursor-pointer">
              Preserva accessori delle aperture non target
            </Label>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Note aggiuntive</Label>
        <Textarea
          value={value.note_libere ?? ""}
          onChange={(event) => set("note_libere", event.target.value)}
          placeholder="Es. mantieni contorni in pietra, non toccare ringhiera balcone, applica solo alla finestra centrale..."
          rows={3}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
