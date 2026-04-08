import { Check } from "lucide-react";

export type ManigliaStile =
  | "toulon"
  | "classica_dritta"
  | "vienna"
  | "q_moderna"
  | "con_rosetta"
  | "pomolo"
  | "alzante"
  | "nessuna";

export interface ManigliaConfig {
  stile: ManigliaStile;
  colore_hardware_id: string;
  colore_hardware_finish: string;
}

export const MANIGLIE: { stile: ManigliaStile; name: string; sub: string; icon: string; prompt_fragment: string }[] = [
  { stile: "toulon", name: "Toulon", sub: "Curva ergonomica, moderna", icon: "〰", prompt_fragment: "Toulon-style curved ergonomic lever handle — smooth S-curve body form, rounded grip terminus, 130-145mm total length, slim 22-25mm grip diameter, visible curved shank transition from backplate to lever body" },
  { stile: "classica_dritta", name: "Classica", sub: "Leva dritta standard", icon: "—", prompt_fragment: "Classic straight lever handle — flat rectangular profile, 120-130mm lever length, 20-22mm grip thickness, square or slightly beveled edges, standard Italian residential window hardware" },
  { stile: "vienna", name: "Vienna", sub: "A farfalla, classico/retrò", icon: "🦋", prompt_fragment: "Vienna butterfly-wing (farfalla) lever handle — two symmetric curved wing-lobes flanking the center spindle rose, graceful organic silhouette, traditional Viennese architectural style, ornate period-appropriate appearance with visible casting detail" },
  { stile: "q_moderna", name: "Q Moderna", sub: "Squadrata minimale", icon: "▬", prompt_fragment: "Q-model squared minimal lever handle — strict rectangular cross-section with sharp 90° corners, completely flat face with no rounding, 125-135mm lever length, Bauhaus/industrial minimalist style, clean architectural appearance" },
  { stile: "con_rosetta", name: "Con Rosetta", sub: "Con piastra decorativa", icon: "⊙", prompt_fragment: "Lever handle with decorative backplate (con rosetta) — circular or square backplate 50-60mm spanning the spindle area, lever body 120-130mm emerging from plate center, visible screw heads on plate corners or perimeter" },
  { stile: "pomolo", name: "Pomolo", sub: "A sfera/cilindro", icon: "⬤", prompt_fragment: "Round pomolo knob handle — spherical or cylindrical form 35-45mm diameter, compact low projection from frame face, smooth rounded surface with visible setscrew or cover cap" },
  { stile: "alzante", name: "Alzante", sub: "Per scorrevoli pesanti", icon: "↕️", prompt_fragment: "Lift-and-slide (alzante) operating handle — long ergonomic lever 200-280mm with curved palm grip, heavy die-cast body with visible mechanism pivot, projects 60-80mm from frame face, used on large sliding door panels" },
  { stile: "nessuna", name: "Nessuna", sub: "Fisso / senza maniglia", icon: "✕", prompt_fragment: "Fixed light (no handle) — completely clean frame face with no handle hardware, no backplate, no visible spindle hole. The sash is non-opening." },
];

export const HARDWARE_COLORS: { id: string; name: string; hex: string; finish: string }[] = [
  { id: "cromo_lucido", name: "Cromo Lucido", hex: "#C0C0C0", finish: "polished chrome — bright specular reflection" },
  { id: "inox_spazzolato", name: "Inox Spazzolato", hex: "#9BA0A0", finish: "brushed stainless steel — directional satin micro-lines" },
  { id: "nero_opaco", name: "Nero Opaco", hex: "#1A1A1A", finish: "matte black powder coat — no specular highlight" },
  { id: "nero_lucido", name: "Nero Lucido", hex: "#0D0D0D", finish: "gloss black — clear specular reflection" },
  { id: "bronzo_anticato", name: "Bronzo Anticato", hex: "#7C5B3E", finish: "antique bronze patina — warm irregular oxidized surface" },
  { id: "oro_pvd", name: "Oro PVD", hex: "#C9A84C", finish: "polished gold PVD coating — warm yellow specular reflection" },
  { id: "ottone_spazzolato", name: "Ottone Spazzolato", hex: "#B09060", finish: "brushed brass — warm gold directional micro-lines" },
  { id: "titanio", name: "Titanio", hex: "#888B8D", finish: "titanium anodized — cool grey with subtle metallic depth" },
];

interface ManigliaSelectorProps {
  value: ManigliaConfig;
  onChange: (config: ManigliaConfig) => void;
}

export default function ManigliaSelector({ value, onChange }: ManigliaSelectorProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-semibold mb-2 block">Tipo Maniglia</label>
        <div className="grid grid-cols-2 gap-2">
          {MANIGLIE.map(m => (
            <button
              key={m.stile}
              onClick={() => onChange({ ...value, stile: m.stile })}
              className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                value.stile === m.stile
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <span className="text-lg mt-0.5">{m.icon}</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground block">{m.name}</span>
                <span className="text-[10px] text-muted-foreground">{m.sub}</span>
              </div>
              {value.stile === m.stile && <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-semibold mb-2 block">Finitura Hardware</label>
        <div className="grid grid-cols-4 gap-2">
          {HARDWARE_COLORS.map(hc => (
            <button
              key={hc.id}
              onClick={() => onChange({ ...value, colore_hardware_id: hc.id, colore_hardware_finish: hc.finish })}
              className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${
                value.colore_hardware_id === hc.id
                  ? "border-primary ring-1 ring-primary"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <div className="w-8 h-8 rounded-full border border-border" style={{ backgroundColor: hc.hex }} />
              <span className="text-[10px] text-muted-foreground text-center leading-tight">{hc.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
