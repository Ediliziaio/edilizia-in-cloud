import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type {
  TipoPavimento,
  FinituraPavimento,
  PatternPosa,
  ConfigurazionePavimento,
} from "@/modules/render-pavimento/lib/types";

// ── DEFAULT CONFIG ───────────────────────────────────────────────────────────
export const DEFAULT_PAVIMENTO_CONFIG: ConfigurazionePavimento = {
  tipo: "gres_porcellanato",
  finitura: "opaco",
  colore_mode: "free",
  colore_nome: "Grigio chiaro",
  colore_hex: "#b0b0b0",
  pattern_posa: "a_correre",
  formato_piastrella: "60x60",
  fuga_larghezza_mm: 2,
  fuga_colore: "grigio_chiaro",
  battiscopa: {
    azione: "mantieni",
  },
  note_libere: "",
};

// ── Floor type options ───────────────────────────────────────────────────────
const FLOOR_TYPES: { value: TipoPavimento; label: string; color: string }[] = [
  { value: "parquet_massello", label: "Parquet massello", color: "#8B6914" },
  { value: "parquet_prefinito", label: "Parquet prefinito", color: "#A0784C" },
  { value: "laminato", label: "Laminato", color: "#C4A87C" },
  { value: "gres_porcellanato", label: "Gres porcellanato", color: "#9E9E9E" },
  { value: "ceramica", label: "Ceramica", color: "#D4C4A8" },
  { value: "marmo", label: "Marmo", color: "#E8E0D0" },
  { value: "pietra_naturale", label: "Pietra naturale", color: "#A89888" },
  { value: "vinile_lvt", label: "Vinile LVT", color: "#B8A898" },
  { value: "cotto", label: "Cotto", color: "#C0623A" },
  { value: "cemento_resina", label: "Cemento / Resina", color: "#888888" },
  { value: "moquette", label: "Moquette", color: "#6B5B4F" },
  { value: "terrazzo_veneziano", label: "Terrazzo veneziano", color: "#C8BEB0" },
];

// ── Pattern options ──────────────────────────────────────────────────────────
const PATTERNS: { value: PatternPosa; label: string }[] = [
  { value: "rettilineo_dritto", label: "Rettilineo dritto" },
  { value: "a_correre", label: "A correre (50%)" },
  { value: "sfalsato_33", label: "Sfalsato 1/3" },
  { value: "spina_di_pesce", label: "Spina di pesce" },
  { value: "spina_ungherese", label: "Spina ungherese" },
  { value: "diagonale_45", label: "Diagonale 45\u00B0" },
  { value: "cassero_irregolare", label: "Cassero irregolare" },
  { value: "opus_romanum", label: "Opus romanum" },
  { value: "doppia_fila", label: "Doppia fila" },
  { value: "modulare", label: "Modulare" },
  { value: "esagonale", label: "Esagonale" },
];

// ── Finish options ───────────────────────────────────────────────────────────
const FINITURE: { value: FinituraPavimento; label: string }[] = [
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

const FORMATI = [
  "20x20", "30x30", "45x45", "60x60", "60x120", "80x80", "120x120", "30x60",
];

const FUGA_COLORI: { value: string; label: string }[] = [
  { value: "bianco", label: "Bianco" },
  { value: "grigio_chiaro", label: "Grigio chiaro" },
  { value: "grigio_scuro", label: "Grigio scuro" },
  { value: "nero", label: "Nero" },
  { value: "beige", label: "Beige" },
  { value: "tono_su_tono", label: "Tono su tono" },
];

const BATTISCOPA_TIPI: { value: string; label: string }[] = [
  { value: "coordinato_pavimento", label: "Coordinato al pavimento" },
  { value: "bianco", label: "Bianco" },
  { value: "legno", label: "Legno" },
  { value: "alluminio", label: "Alluminio" },
];

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  value: ConfigurazionePavimento;
  onChange: (v: ConfigurazionePavimento) => void;
  disabled?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────
export function PavimentoConfigForm({ value, onChange, disabled }: Props) {
  const set = <K extends keyof ConfigurazionePavimento>(
    key: K,
    val: ConfigurazionePavimento[K],
  ) => onChange({ ...value, [key]: val });

  const hasBattiscopa = value.battiscopa?.azione === "sostituisci";
  const isSostituisci = value.battiscopa?.azione === "sostituisci";

  return (
    <div className="space-y-5">
      {/* ── Tipo pavimento (card grid) ─────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label>Tipo pavimento *</Label>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {FLOOR_TYPES.map((ft) => (
            <button
              key={ft.value}
              type="button"
              disabled={disabled}
              onClick={() => set("tipo", ft.value)}
              className={`rounded-lg border p-2 text-left transition-all text-xs font-medium
                ${value.tipo === ft.value
                  ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                  : "border-border hover:border-primary/40"
                } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div
                className="w-full h-6 rounded mb-1.5"
                style={{ backgroundColor: ft.color }}
              />
              <span className="leading-tight block">{ft.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Pattern posa (card grid 3x4) ───────────────────────────────── */}
      <div className="space-y-1.5">
        <Label>Schema di posa *</Label>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {PATTERNS.map((p) => (
            <button
              key={p.value}
              type="button"
              disabled={disabled}
              onClick={() => set("pattern_posa", p.value)}
              className={`rounded-lg border p-2.5 text-xs font-medium transition-all
                ${value.pattern_posa === p.value
                  ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                  : "border-border hover:border-primary/40"
                } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Finitura + Colore ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Finitura *</Label>
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
        <div className="space-y-1.5">
          <Label>Colore</Label>
          <div className="flex gap-2">
            <Input
              value={value.colore_nome ?? ""}
              onChange={(e) => set("colore_nome", e.target.value)}
              placeholder="Es. Grigio cemento"
              disabled={disabled}
              className="flex-1"
            />
            <Input
              type="color"
              value={value.colore_hex ?? "#b0b0b0"}
              onChange={(e) => set("colore_hex", e.target.value)}
              disabled={disabled}
              className="w-12 p-1 h-9"
            />
          </div>
        </div>
      </div>

      {/* ── Formato piastrella ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Formato (cm)</Label>
          <Select
            value={value.formato_piastrella ?? "60x60"}
            onValueChange={(v) => set("formato_piastrella", v)}
            disabled={disabled}
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
          <Label>Dimensioni listello (mm)</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={50}
              max={400}
              placeholder="Largh."
              value={value.larghezza_listello_mm ?? ""}
              onChange={(e) => set("larghezza_listello_mm", Number(e.target.value) || undefined)}
              disabled={disabled}
            />
            <Input
              type="number"
              min={100}
              max={3000}
              placeholder="Lungh."
              value={value.lunghezza_listello_mm ?? ""}
              onChange={(e) => set("lunghezza_listello_mm", Number(e.target.value) || undefined)}
              disabled={disabled}
            />
          </div>
        </div>
      </div>

      {/* ── Fuga ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Larghezza fuga (mm)</Label>
          <Input
            type="number"
            min={0}
            max={15}
            value={value.fuga_larghezza_mm ?? 2}
            onChange={(e) => set("fuga_larghezza_mm", Number(e.target.value))}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Colore fuga</Label>
          <Select
            value={value.fuga_colore ?? "grigio_chiaro"}
            onValueChange={(v) => set("fuga_colore", v as ConfigurazionePavimento["fuga_colore"])}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FUGA_COLORI.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Battiscopa ──────────────────────────────────────────────────── */}
      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between">
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
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mantieni">Mantieni</SelectItem>
              <SelectItem value="sostituisci">Sostituisci</SelectItem>
              <SelectItem value="rimuovi">Rimuovi</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isSostituisci && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select
                value={value.battiscopa?.tipo ?? "coordinato_pavimento"}
                onValueChange={(v) =>
                  set("battiscopa", {
                    ...value.battiscopa!,
                    tipo: v as ConfigurazionePavimento["battiscopa"] extends infer B ? B extends { tipo?: infer T } ? T : never : never,
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

      {/* ── Note libere ─────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label>Note aggiuntive</Label>
        <Textarea
          value={value.note_libere ?? ""}
          onChange={(e) => set("note_libere", e.target.value)}
          placeholder="Specifiche aggiuntive (es. pavimento riscaldante, zoccolino a filo muro...)"
          rows={2}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
