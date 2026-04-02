import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export interface RenderConfig {
  materiale: string;
  apertura: string;
  colore: string;
  vetro: string;
  stile_ambiente: string;
  larghezza: number;
  altezza: number;
  numero_ante: number;
  note_libere: string;
}

interface Props {
  value: RenderConfig;
  onChange: (v: RenderConfig) => void;
  disabled?: boolean;
}

const MATERIALI = [
  { value: "pvc", label: "PVC" },
  { value: "alluminio", label: "Alluminio" },
  { value: "legno", label: "Legno" },
  { value: "legno-alluminio", label: "Legno-Alluminio" },
  { value: "acciaio", label: "Acciaio" },
];

const APERTURE = [
  { value: "battente", label: "Battente" },
  { value: "scorrevole-alzante", label: "Scorrevole alzante" },
  { value: "vasistas", label: "Vasistas" },
  { value: "a-libro", label: "A libro" },
  { value: "fisso", label: "Fisso" },
  { value: "tilt_turn", label: "Oscillotraslante" },
];

const COLORI = [
  { value: "bianco", label: "Bianco RAL 9016" },
  { value: "grigio-antracite", label: "Grigio antracite RAL 7016" },
  { value: "grigio-chiaro", label: "Grigio chiaro RAL 7035" },
  { value: "nero", label: "Nero RAL 9005" },
  { value: "bronzo-marrone", label: "Bronzo/Marrone RAL 8019" },
  { value: "legno-chiaro", label: "Effetto legno chiaro" },
  { value: "legno-scuro", label: "Effetto legno scuro" },
  { value: "ral_personalizzato", label: "RAL personalizzato" },
];

const VETRI = [
  { value: "trasparente", label: "Trasparente" },
  { value: "basso_emissivo", label: "Basso emissivo" },
  { value: "satinato", label: "Satinato" },
  { value: "specchiato", label: "Specchiato" },
  { value: "colorato", label: "Colorato" },
];

const STILI = [
  { value: "moderno", label: "Moderno" },
  { value: "classico", label: "Classico" },
  { value: "industriale", label: "Industriale" },
  { value: "rurale", label: "Rurale" },
  { value: "minimalista", label: "Minimalista" },
  { value: "mediterraneo", label: "Mediterraneo" },
];

export function RenderConfigForm({ value, onChange, disabled }: Props) {
  const set = <K extends keyof RenderConfig>(key: K, val: RenderConfig[K]) =>
    onChange({ ...value, [key]: val });

  return (
    <div className="space-y-4">
      {/* Row 1: materiale + apertura */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Materiale *</Label>
          <Select value={value.materiale} onValueChange={v => set("materiale", v)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MATERIALI.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo apertura *</Label>
          <Select value={value.apertura} onValueChange={v => set("apertura", v)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {APERTURE.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2: colore + vetro */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Colore profilo *</Label>
          <Select value={value.colore} onValueChange={v => set("colore", v)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COLORI.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo vetro *</Label>
          <Select value={value.vetro} onValueChange={v => set("vetro", v)} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {VETRI.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 3: dimensioni + ante */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Larghezza (cm)</Label>
          <Input
            type="number"
            min={40}
            max={400}
            value={value.larghezza}
            onChange={e => set("larghezza", parseInt(e.target.value) || 120)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Altezza (cm)</Label>
          <Input
            type="number"
            min={40}
            max={300}
            value={value.altezza}
            onChange={e => set("altezza", parseInt(e.target.value) || 150)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Numero ante</Label>
          <Input
            type="number"
            min={1}
            max={6}
            value={value.numero_ante}
            onChange={e => set("numero_ante", parseInt(e.target.value) || 2)}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Stile ambiente */}
      <div className="space-y-1.5">
        <Label>Stile edificio</Label>
        <Select value={value.stile_ambiente} onValueChange={v => set("stile_ambiente", v)} disabled={disabled}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {STILI.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Note libere */}
      <div className="space-y-1.5">
        <Label>Note aggiuntive</Label>
        <Textarea
          value={value.note_libere}
          onChange={e => set("note_libere", e.target.value)}
          placeholder="Specifiche aggiuntive per il render (es: mantieni persiane esistenti, aggiungi grate di sicurezza...)"
          rows={2}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
