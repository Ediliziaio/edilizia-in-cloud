import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Replace,
  Paintbrush,
  PlusCircle,
  Trash2,
  PanelLeftClose,
  Blinds,
  DoorClosed,
  Frame,
  Grid3X3,
  ArrowDownUp,
  BookOpen,
  ShieldCheck,
  SunDim,
} from "lucide-react";

import type {
  ConfigurazionePersiane,
  TipoOperazione,
  TipoPersiana,
  MaterialePersiana,
  StatoApertura,
  AperturaLamelle,
} from "@/modules/render-persiane/lib/types";
import { TIPI_CON_LAMELLE } from "@/modules/render-persiane/lib/types";

// ── Default config ───────────────────────────────────────────────────────────
export const DEFAULT_PERSIANE_CONFIG: ConfigurazionePersiane = {
  operazione: "sostituisci",
  tipo: "veneziana_classica",
  materiale: "legno_naturale",
  colore_mode: "ral",
  colore_ral: "9010",
  colore_nome: "Bianco puro",
  colore_hex: "#F7F5EF",
  stato_apertura: "chiuso",
  lamelle: {
    larghezza_mm: 50,
    apertura: "chiuse",
  },
  applica_tutte_finestre: true,
};

// ── Operation cards ──────────────────────────────────────────────────────────
const OPERAZIONI: { value: TipoOperazione; label: string; desc: string; icon: typeof Replace }[] = [
  { value: "sostituisci", label: "Sostituisci", desc: "Rimuovi le attuali e installa nuove persiane", icon: Replace },
  { value: "cambia_colore", label: "Cambia colore", desc: "Mantieni il tipo, cambia solo il colore", icon: Paintbrush },
  { value: "aggiungi", label: "Aggiungi", desc: "Installa persiane dove non ci sono", icon: PlusCircle },
  { value: "rimuovi", label: "Rimuovi", desc: "Rimuovi completamente le persiane", icon: Trash2 },
];

// ── Shutter types grid ───────────────────────────────────────────────────────
const TIPI_PERSIANA: { value: TipoPersiana; label: string; icon: typeof PanelLeftClose }[] = [
  { value: "veneziana_classica", label: "Veneziana classica", icon: PanelLeftClose },
  { value: "veneziana_esterna", label: "Veneziana esterna", icon: Blinds },
  { value: "scuro_pieno", label: "Scuro pieno", icon: DoorClosed },
  { value: "scuro_cornice", label: "Scuro a cornice", icon: Frame },
  { value: "gelosia", label: "Gelosia", icon: Grid3X3 },
  { value: "avvolgibile_esterno", label: "Avvolgibile", icon: ArrowDownUp },
  { value: "a_libro", label: "A libro", icon: BookOpen },
  { value: "griglia_sicurezza", label: "Griglia sicurezza", icon: ShieldCheck },
  { value: "brise_soleil", label: "Brise-soleil", icon: SunDim },
];

// ── Materials ────────────────────────────────────────────────────────────────
const MATERIALI: { value: MaterialePersiana; label: string }[] = [
  { value: "legno_naturale", label: "Legno naturale" },
  { value: "legno_composito", label: "Legno composito" },
  { value: "alluminio", label: "Alluminio" },
  { value: "pvc", label: "PVC" },
  { value: "acciaio", label: "Acciaio" },
  { value: "fibra_vetro", label: "Fibra di vetro" },
];

// ── Quick RAL colors ─────────────────────────────────────────────────────────
const RAL_QUICK_COLORS: { ral: string; nome: string; hex: string }[] = [
  { ral: "9010", nome: "Bianco puro", hex: "#F7F5EF" },
  { ral: "7016", nome: "Grigio antracite", hex: "#383E42" },
  { ral: "6005", nome: "Verde muschio", hex: "#0F4336" },
  { ral: "8017", nome: "Marrone cioccolato", hex: "#44322D" },
  { ral: "1013", nome: "Bianco perla", hex: "#E3D9C6" },
  { ral: "7016", nome: "Antracite", hex: "#383E42" },
];

// ── Wood effects ─────────────────────────────────────────────────────────────
const EFFETTI_LEGNO = [
  { value: "rovere_chiaro", label: "Rovere chiaro" },
  { value: "rovere_scuro", label: "Rovere scuro" },
  { value: "noce_nazionale", label: "Noce nazionale" },
  { value: "castagno", label: "Castagno" },
  { value: "douglas", label: "Douglas" },
];

// ── Apertura states ──────────────────────────────────────────────────────────
const STATI_APERTURA: { value: StatoApertura; label: string }[] = [
  { value: "chiuso", label: "Chiuso" },
  { value: "socchiuso", label: "Socchiuso" },
  { value: "aperto_45", label: "Aperto 45\u00b0" },
  { value: "aperto_90", label: "Aperto 90\u00b0" },
  { value: "anta_singola_aperta", label: "Anta singola aperta" },
];

// ── Lamelle widths ───────────────────────────────────────────────────────────
const LARGHEZZE_LAMELLE: { value: 40 | 50 | 60 | 80; label: string }[] = [
  { value: 40, label: "40 mm" },
  { value: 50, label: "50 mm" },
  { value: 60, label: "60 mm" },
  { value: 80, label: "80 mm" },
];

const APERTURE_LAMELLE: { value: AperturaLamelle; label: string }[] = [
  { value: "chiuse", label: "Chiuse" },
  { value: "parzialmente_aperte", label: "Parzialmente aperte" },
  { value: "completamente_aperte", label: "Completamente aperte" },
];

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  value: ConfigurazionePersiane;
  onChange: (v: ConfigurazionePersiane) => void;
  disabled?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────
export function PersianeConfigForm({ value, onChange, disabled }: Props) {
  const set = <K extends keyof ConfigurazionePersiane>(
    key: K,
    val: ConfigurazionePersiane[K],
  ) => onChange({ ...value, [key]: val });

  const showFullConfig = value.operazione !== "rimuovi";
  const showColorOnly = value.operazione === "cambia_colore";
  const showLamelle = TIPI_CON_LAMELLE.has(value.tipo);

  return (
    <div className="space-y-6">
      {/* ── Operazione ──────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Operazione *</Label>
        <div className="grid grid-cols-2 gap-2">
          {OPERAZIONI.map(({ value: v, label, desc, icon: Icon }) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => set("operazione", v)}
              className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                value.operazione === v
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border hover:border-muted-foreground/30"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div
                className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                  value.operazione === v ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Tipo persiana (non per rimuovi) ──────────────────────────── */}
      {showFullConfig && !showColorOnly && (
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Tipo persiana *</Label>
          <div className="grid grid-cols-3 gap-2">
            {TIPI_PERSIANA.map(({ value: v, label, icon: Icon }) => (
              <button
                key={v}
                type="button"
                disabled={disabled}
                onClick={() => {
                  set("tipo", v);
                  // Auto-set lamelle if type supports it
                  if (TIPI_CON_LAMELLE.has(v) && !value.lamelle) {
                    onChange({
                      ...value,
                      tipo: v,
                      lamelle: { larghezza_mm: 50, apertura: "chiuse" },
                    });
                  }
                }}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-all ${
                  value.tipo === v
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border hover:border-muted-foreground/30"
                } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <Icon
                  className={`h-5 w-5 ${
                    value.tipo === v ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                <span className="text-xs font-medium leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Materiale (non per rimuovi e cambia_colore) ───────────────── */}
      {showFullConfig && !showColorOnly && (
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Materiale *</Label>
          <Select
            value={value.materiale}
            onValueChange={(v) => set("materiale", v as MaterialePersiana)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MATERIALI.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── Colore ──────────────────────────────────────────────────── */}
      {showFullConfig && (
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Colore *</Label>

          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => set("colore_mode", "ral")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                value.colore_mode === "ral"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Colore RAL
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => set("colore_mode", "legno")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                value.colore_mode === "legno"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Effetto legno
            </button>
          </div>

          {/* RAL quick colors */}
          {value.colore_mode === "ral" && (
            <div className="flex flex-wrap gap-2">
              {RAL_QUICK_COLORS.map((c) => (
                <button
                  key={c.ral + c.nome}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      ...value,
                      colore_ral: c.ral,
                      colore_nome: c.nome,
                      colore_hex: c.hex,
                    })
                  }
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs transition-all ${
                    value.colore_ral === c.ral && value.colore_nome === c.nome
                      ? "border-primary ring-1 ring-primary/30"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <div
                    className="w-4 h-4 rounded-full border border-black/10"
                    style={{ backgroundColor: c.hex }}
                  />
                  <span>
                    {c.nome} ({c.ral})
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Wood effect selector */}
          {value.colore_mode === "legno" && (
            <Select
              value={value.effetto_legno ?? "rovere_chiaro"}
              onValueChange={(v) => set("effetto_legno", v)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EFFETTI_LEGNO.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* ── Stato apertura ──────────────────────────────────────────── */}
      {showFullConfig && (
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Stato apertura</Label>
          <div className="flex flex-wrap gap-2">
            {STATI_APERTURA.map(({ value: v, label }) => (
              <button
                key={v}
                type="button"
                disabled={disabled}
                onClick={() => set("stato_apertura", v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                  value.stato_apertura === v
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Lamelle (solo per tipi con lamelle) ──────────────────────── */}
      {showFullConfig && !showColorOnly && showLamelle && (
        <div className="space-y-3 p-3 rounded-lg bg-muted/30 border">
          <Label className="text-sm font-semibold">Lamelle</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Larghezza</Label>
              <Select
                value={String(value.lamelle?.larghezza_mm ?? 50)}
                onValueChange={(v) =>
                  onChange({
                    ...value,
                    lamelle: {
                      ...(value.lamelle ?? { larghezza_mm: 50, apertura: "chiuse" as const }),
                      larghezza_mm: Number(v) as 40 | 50 | 60 | 80,
                    },
                  })
                }
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LARGHEZZE_LAMELLE.map((l) => (
                    <SelectItem key={l.value} value={String(l.value)}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Apertura</Label>
              <Select
                value={value.lamelle?.apertura ?? "chiuse"}
                onValueChange={(v) =>
                  onChange({
                    ...value,
                    lamelle: {
                      ...(value.lamelle ?? { larghezza_mm: 50, apertura: "chiuse" as const }),
                      apertura: v as AperturaLamelle,
                    },
                  })
                }
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APERTURE_LAMELLE.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* ── Applica a tutte ────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="applica_tutte"
          checked={value.applica_tutte_finestre}
          onCheckedChange={(checked) =>
            set("applica_tutte_finestre", checked === true)
          }
          disabled={disabled}
        />
        <Label htmlFor="applica_tutte" className="text-sm cursor-pointer">
          Applica a tutte le finestre visibili
        </Label>
      </div>

      {/* ── Note libere ────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label>Note aggiuntive</Label>
        <Textarea
          value={value.note_libere ?? ""}
          onChange={(e) => set("note_libere", e.target.value)}
          placeholder="Specifiche aggiuntive (es. mantenere i davanzali, aggiungere fermaimposta...)"
          rows={2}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
