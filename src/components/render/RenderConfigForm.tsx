import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── v6 schema ─────────────────────────────────────────────────────────────────
export interface RenderConfig {
  nuovo_infisso: {
    materiale: string;
    colore: { ral: string; nome: string; finitura: string };
    colore_mode: "ral" | "legno";
    profilo: { dimensione: string; forma: string };
    vetro: { tipo: string; prompt_fragment: string };
    ferramenta: {
      maniglia_stile: string;
      colore_hardware_id: string;
      colore_hardware_finish: string;
    };
    cerniere: { tipo: string; colore: string; num_per_anta: number };
    num_ante: number;
    stile_telaio: string;
    sostituzione: { infissi: boolean; cassonetto: boolean; tapparella: boolean };
  };
  /** Apertura attuale/desiderata come hint per l'analisi (fuori da nuovo_infisso) */
  apertura_default: string;
  notes: string;
}

interface Props {
  value: RenderConfig;
  onChange: (v: RenderConfig) => void;
  disabled?: boolean;
}

// ── dictionaries ──────────────────────────────────────────────────────────────
const MATERIALI = [
  { value: "pvc",              label: "PVC" },
  { value: "alluminio",        label: "Alluminio" },
  { value: "legno",            label: "Legno" },
  { value: "legno_alluminio",  label: "Legno-Alluminio" },
  { value: "acciaio_minimale", label: "Acciaio minimale" },
];

interface ColoreOption {
  ral: string;
  nome: string;
  finitura: string;
  mode: "ral" | "legno";
  id: string;
}

const COLORI: ColoreOption[] = [
  { id: "bianco",       ral: "9016", nome: "Bianco",             finitura: "liscio_opaco", mode: "ral"   },
  { id: "antracite",    ral: "7016", nome: "Grigio antracite",   finitura: "liscio_opaco", mode: "ral"   },
  { id: "nero",         ral: "9005", nome: "Nero",               finitura: "liscio_opaco", mode: "ral"   },
  { id: "marrone",      ral: "8019", nome: "Marrone tabacco",    finitura: "liscio_opaco", mode: "ral"   },
  { id: "bianco_perla", ral: "1013", nome: "Bianco perla",       finitura: "liscio_opaco", mode: "ral"   },
  { id: "legno_chiaro", ral: "",     nome: "Effetto legno chiaro", finitura: "venatura_legno", mode: "legno" },
  { id: "legno_scuro",  ral: "",     nome: "Effetto legno scuro",  finitura: "venatura_legno", mode: "legno" },
];

const VETRO_PROMPT: Record<string, string> = {
  trasparente:    "double glazed clear glass",
  basso_emissivo: "double glazed low-e glass with slight blue-green tint",
  satinato:       "frosted/satin glass, diffused light",
  specchiato:     "mirror-effect glass, strong reflective surface",
};

const VETRI = [
  { value: "trasparente",    label: "Trasparente" },
  { value: "basso_emissivo", label: "Basso emissivo" },
  { value: "satinato",       label: "Satinato" },
  { value: "specchiato",     label: "Specchiato" },
];

const APERTURE = [
  { value: "battente_1_anta", label: "Battente 1 anta" },
  { value: "battente_2_ante", label: "Battente 2 ante" },
  { value: "scorrevole",      label: "Scorrevole" },
  { value: "vasistas",        label: "Vasistas" },
  { value: "anta_ribalta",    label: "Anta-ribalta (oscillo)" },
  { value: "fisso",           label: "Fisso" },
];

const MANIGLIE = [
  { value: "classica_dritta", label: "Classica dritta" },
  { value: "toulon",          label: "Toulon (curva)" },
  { value: "q_moderna",       label: "Q Moderna (squared)" },
  { value: "pomolo",          label: "Pomolo" },
  { value: "alzante",         label: "Alzante (scorrevole)" },
];

const HW_FINISH: Record<string, string> = {
  cromo_lucido:    "polished chrome",
  inox_spazzolato: "brushed stainless steel",
  nero_opaco:      "matte black powder coat",
  bronzo_anticato: "antique bronze",
};

const HARDWARE_COLORI = [
  { value: "cromo_lucido",    label: "Cromo lucido" },
  { value: "inox_spazzolato", label: "Inox spazzolato" },
  { value: "nero_opaco",      label: "Nero opaco" },
  { value: "bronzo_anticato", label: "Bronzo anticato" },
];

const PROFILI = [
  { value: "70mm", label: "70mm — Residenziale" },
  { value: "82mm", label: "82mm — Premium" },
  { value: "92mm", label: "92mm — Passivhaus" },
];

// ── component ─────────────────────────────────────────────────────────────────
export function RenderConfigForm({ value, onChange, disabled }: Props) {
  const ni = value.nuovo_infisso;

  /** Update a field inside nuovo_infisso */
  const setNI = <K extends keyof typeof ni>(key: K, val: (typeof ni)[K]) =>
    onChange({ ...value, nuovo_infisso: { ...ni, [key]: val } });

  /** Handle colore select — maps option id → full colore object + colore_mode */
  const handleColoreChange = (id: string) => {
    const opt = COLORI.find(c => c.id === id);
    if (!opt) return;
    setNI("colore", { ral: opt.ral, nome: opt.nome, finitura: opt.finitura });
    setNI("colore_mode", opt.mode);
  };

  /** Derive current colore option id from value */
  const coloreId =
    ni.colore_mode === "legno"
      ? (ni.colore.nome.includes("chiaro") ? "legno_chiaro" : "legno_scuro")
      : (COLORI.find(c => c.ral === ni.colore.ral)?.id ?? "bianco");

  /** Handle vetro change — auto-sets prompt_fragment */
  const handleVetroChange = (tipo: string) =>
    setNI("vetro", { tipo, prompt_fragment: VETRO_PROMPT[tipo] ?? "double glazed clear glass" });

  /** Handle hardware colore — auto-sets finish */
  const handleHwColoreChange = (id: string) =>
    setNI("ferramenta", {
      ...ni.ferramenta,
      colore_hardware_id: id,
      colore_hardware_finish: HW_FINISH[id] ?? "polished chrome",
    });

  return (
    <div className="space-y-4">
      {/* Row 1: materiale + colore */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Materiale *</Label>
          <Select value={ni.materiale} onValueChange={v => setNI("materiale", v)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MATERIALI.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Colore profilo *</Label>
          <Select value={coloreId} onValueChange={handleColoreChange} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COLORI.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}{c.ral ? ` (RAL ${c.ral})` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2: vetro + apertura */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Tipo vetro *</Label>
          <Select value={ni.vetro.tipo} onValueChange={handleVetroChange} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {VETRI.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo apertura</Label>
          <Select
            value={value.apertura_default}
            onValueChange={v => onChange({ ...value, apertura_default: v })}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {APERTURE.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 3: maniglia + colore hardware */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Maniglia</Label>
          <Select
            value={ni.ferramenta.maniglia_stile}
            onValueChange={v => setNI("ferramenta", { ...ni.ferramenta, maniglia_stile: v })}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MANIGLIE.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Finitura hardware</Label>
          <Select
            value={ni.ferramenta.colore_hardware_id}
            onValueChange={handleHwColoreChange}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {HARDWARE_COLORI.map(h => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 4: profilo + num ante */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Sistema profilo</Label>
          <Select
            value={ni.profilo.dimensione}
            onValueChange={v => setNI("profilo", { ...ni.profilo, dimensione: v })}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROFILI.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Numero ante</Label>
          <Input
            type="number"
            min={1}
            max={4}
            value={ni.num_ante}
            onChange={e => setNI("num_ante", parseInt(e.target.value) || 2)}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Note aggiuntive */}
      <div className="space-y-1.5">
        <Label>Note aggiuntive</Label>
        <Textarea
          value={value.notes}
          onChange={e => onChange({ ...value, notes: e.target.value })}
          placeholder="Specifiche aggiuntive (es. mantieni persiane, aggiungi zanzariera...)"
          rows={2}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
