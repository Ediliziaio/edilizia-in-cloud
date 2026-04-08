import { useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

// ── Tipo: colore RAL solido
export interface RalColor {
  ral: string;
  name: string;
  hex: string;
  group: string;
  popular?: boolean;
}

// ── Tipo: effetto legno (pellicola laccatura / lamina)
export interface WoodEffect {
  id: string;
  name: string;
  name_en: string;
  base_hex: string;
  grain_hex: string;
  prompt_fragment: string;
  popular?: boolean;
}

export type ColorMode = "ral" | "legno";

// Helper: testo da inviare al prompt AI
export function formatColorPrompt(mode: ColorMode, ralColor: RalColor | null, woodEffect: WoodEffect | null): string {
  if (mode === "legno" && woodEffect) {
    return `${woodEffect.name} wood-effect laminate foil finish (${woodEffect.name_en}): ${woodEffect.prompt_fragment}`;
  }
  if (ralColor) {
    return `${ralColor.name} (RAL ${ralColor.ral}, hex ${ralColor.hex}) — solid smooth finish`;
  }
  return "Bianco Traffico (RAL 9016) — solid smooth finish";
}

// ── Catalogo RAL
export const RAL_COLORS: RalColor[] = [
  { ral: "9016", name: "Bianco Traffico", hex: "#F1F0EB", group: "bianchi", popular: true },
  { ral: "9010", name: "Bianco Puro", hex: "#F4F4F4", group: "bianchi", popular: true },
  { ral: "9001", name: "Bianco Crema", hex: "#FDF4E3", group: "bianchi", popular: true },
  { ral: "9003", name: "Bianco Segnale", hex: "#ECECE7", group: "bianchi" },
  { ral: "9002", name: "Bianco Grigio", hex: "#E7E4DC", group: "bianchi" },
  // GRIGI
  { ral: "7016", name: "Grigio Antracite", hex: "#383E42", group: "grigi", popular: true },
  { ral: "7021", name: "Grigio Nero", hex: "#2E3234", group: "grigi", popular: true },
  { ral: "7035", name: "Grigio Chiaro", hex: "#CBD0CC", group: "grigi", popular: true },
  { ral: "7036", name: "Grigio Platino", hex: "#9A9697", group: "grigi" },
  { ral: "7022", name: "Grigio Ombra", hex: "#4B4D48", group: "grigi" },
  { ral: "7037", name: "Grigio Polvere", hex: "#7F8275", group: "grigi" },
  { ral: "7030", name: "Grigio Pietra", hex: "#8E8C7F", group: "grigi" },
  { ral: "7040", name: "Grigio Finestra", hex: "#9BA0A4", group: "grigi" },
  { ral: "7042", name: "Grigio Traffico A", hex: "#8E9291", group: "grigi" },
  { ral: "7043", name: "Grigio Traffico B", hex: "#4E5451", group: "grigi" },
  // NERI
  { ral: "9005", name: "Nero Intenso", hex: "#0A0A0A", group: "neri", popular: true },
  { ral: "9004", name: "Nero Segnale", hex: "#282828", group: "neri" },
  { ral: "9011", name: "Nero Grafite", hex: "#1C1C1C", group: "neri" },
  // MARRONI
  { ral: "8014", name: "Seppia", hex: "#4A3728", group: "marroni", popular: true },
  { ral: "8003", name: "Marrone Argilla", hex: "#7B4A24", group: "marroni", popular: true },
  { ral: "8019", name: "Grigio Marrone", hex: "#3D3635", group: "marroni", popular: true },
  { ral: "8004", name: "Rame Marrone", hex: "#8E402A", group: "marroni" },
  { ral: "8011", name: "Marrone Noce", hex: "#5B3A29", group: "marroni" },
  { ral: "8016", name: "Mogano RAL", hex: "#4C2A1E", group: "marroni" },
  { ral: "8017", name: "Cioccolato", hex: "#3E2723", group: "marroni" },
  { ral: "8022", name: "Nero Marrone", hex: "#1A1110", group: "marroni" },
  // BEIGE
  { ral: "1001", name: "Beige", hex: "#CDA882", group: "beige", popular: true },
  { ral: "1015", name: "Avorio Chiaro", hex: "#E6D3B3", group: "beige", popular: true },
  { ral: "1013", name: "Bianco Perla", hex: "#EAE0D0", group: "beige" },
  { ral: "1014", name: "Avorio", hex: "#DBC89A", group: "beige" },
  { ral: "1019", name: "Grigio Beige", hex: "#9C896C", group: "beige" },
  // VERDI
  { ral: "6005", name: "Verde Muschio", hex: "#2F4538", group: "verdi", popular: true },
  { ral: "6009", name: "Verde Abete", hex: "#2B3D2A", group: "verdi" },
  // BRONZO / ORO
  { ral: "1036", name: "Oro Perla", hex: "#8B7536", group: "bronzo" },
  // SPECIALI
  { ral: "5014", name: "Blu Colomba", hex: "#637D96", group: "speciali" },
  { ral: "3005", name: "Rosso Vino", hex: "#5E2028", group: "speciali" },
];

// ── Catalogo Effetti Legno
export const WOOD_EFFECTS: WoodEffect[] = [
  { id: "golden_oak", name: "Golden Oak", name_en: "Golden Oak", base_hex: "#C8762B", grain_hex: "#A05A1A", popular: true, prompt_fragment: "Golden Oak laminate foil — warm amber-orange-brown base with clearly visible parallel wood grain lines in a slightly darker amber tone, characteristic of classic PVC window wood-effect films. Surface finish: satin-matte with subtle embossed grain texture. The overall tone is a warm honey-orange oak." },
  { id: "noce", name: "Noce", name_en: "Walnut", base_hex: "#4A2E1C", grain_hex: "#6B4525", popular: true, prompt_fragment: "Noce (Walnut) wood-effect laminate foil — deep warm dark-brown base with visible flowing walnut grain lines in a slightly warmer medium-brown tone, rich and elegant appearance. Surface: satin-matte embossed grain texture." },
  { id: "antracite_legnato", name: "Antracite Legnato", name_en: "Anthracite Wood Effect", base_hex: "#3A3A3A", grain_hex: "#2A2A2A", popular: true, prompt_fragment: "Anthracite wood-effect laminate foil — very dark charcoal-grey base with subtle darker grain lines barely visible against the background, giving a sophisticated dark-wood appearance. The grain texture is present but subdued — more visible in raking light." },
  { id: "bianco_frassino", name: "Bianco Frassino", name_en: "White Ash", base_hex: "#D8D0C0", grain_hex: "#B8A88A", popular: true, prompt_fragment: "Bianco Frassino (White Ash) wood-effect laminate foil — very pale warm-white base with delicate light-grey/beige grain lines giving a bleached-ash wood appearance. Clean Scandinavian aesthetic. Surface: matte-white with embossed grain texture." },
  { id: "sheffield_oak", name: "Sheffield Oak", name_en: "Sheffield Oak", base_hex: "#9A8060", grain_hex: "#7A6040", popular: true, prompt_fragment: "Sheffield Oak laminate foil — medium warm grey-brown base with clear parallel oak grain lines in a slightly darker taupe-brown tone. A contemporary oak effect popular in modern European joinery. Surface: satin-matte with realistic oak grain embossing." },
  { id: "white_oak", name: "White Oak", name_en: "White Oak / Quercia Bianca", base_hex: "#C0AA88", grain_hex: "#A08060", popular: false, prompt_fragment: "White Oak (Quercia Bianca) laminate foil — light natural-beige oak base with medium-brown grain lines, natural warm tone. Surface: satin-matte with open-pore grain embossing." },
  { id: "pino", name: "Pino", name_en: "Pine", base_hex: "#D4A96A", grain_hex: "#B88040", popular: false, prompt_fragment: "Pino (Pine) wood-effect laminate foil — light yellowish-honey pine base with characteristic curved grain lines and knot features, warm rustic cottage-style appearance. Surface: satin-matte with embossed pine-grain texture." },
  { id: "ciliegio", name: "Ciliegio", name_en: "Cherry", base_hex: "#8B3B2A", grain_hex: "#6B2818", popular: false, prompt_fragment: "Ciliegio (Cherry) wood-effect laminate foil — rich warm reddish-brown base with subtle darker cherry-wood grain lines. Elegant warm appearance. Surface: satin with fine grain embossing." },
  { id: "mogano", name: "Mogano", name_en: "Mahogany", base_hex: "#5C2013", grain_hex: "#7A3020", popular: false, prompt_fragment: "Mogano (Mahogany) wood-effect laminate foil — deep red-brown base with interlocked ribbon-stripe grain pattern characteristic of mahogany. Darker and more reddish than Noce. Surface: satin-matte with fine interlocked grain embossing." },
  { id: "wenge", name: "Wengé", name_en: "Wengé", base_hex: "#2C1A0E", grain_hex: "#4A2E10", popular: false, prompt_fragment: "Wengé wood-effect laminate foil — very dark espresso-brown base with clearly contrasting lighter medium-brown grain lines running parallel along the frame length. High-contrast modern premium aesthetic." },
  { id: "silvergrey", name: "Silvergrey", name_en: "Silver Grey Wood", base_hex: "#9AA0A0", grain_hex: "#7A8080", popular: false, prompt_fragment: "Silvergrey wood-effect laminate foil — cool silver-grey base with subtle darker grey grain lines, giving a weathered driftwood or silvered-oak appearance. Contemporary Scandinavian/Nordic aesthetic. Surface: matte with fine grey-on-grey grain texture." },
  { id: "iroko", name: "Iroko", name_en: "Iroko", base_hex: "#8B5E2A", grain_hex: "#6A4515", popular: false, prompt_fragment: "Iroko wood-effect laminate foil — warm medium brown base with interlocked irregular grain pattern typical of African iroko hardwood. Surface: satin-matte with irregular open-pore embossing." },
  { id: "teak", name: "Teak", name_en: "Teak", base_hex: "#B07A30", grain_hex: "#8A5A18", popular: false, prompt_fragment: "Teak wood-effect laminate foil — golden-amber brown base with characteristic straight-to-slightly-wavy grain lines and subtle oil-lustre appearance typical of teak. Surface: satin with oily-textured grain embossing." },
  { id: "douglas", name: "Douglas", name_en: "Douglas Fir", base_hex: "#C0803A", grain_hex: "#9A6020", popular: false, prompt_fragment: "Douglas Fir wood-effect laminate foil — warm orange-red-brown base with wavy swirling grain pattern and occasional darker heartwood streaks. Surface: satin-matte with pronounced swirling grain embossing." },
  { id: "nussbaum", name: "Nussbaum", name_en: "Walnut Light (Nussbaum)", base_hex: "#6B4A2A", grain_hex: "#8B6A3A", popular: false, prompt_fragment: "Nussbaum (German-style light walnut) laminate foil — medium warm brown base lighter than Italian Noce, with clear visible walnut grain in a slightly warmer lighter-brown tone. Surface: satin-matte with walnut grain embossing." },
];

const RAL_GROUPS = [
  { key: "popular", label: "⭐ Più usati" },
  { key: "bianchi", label: "Bianchi" },
  { key: "grigi", label: "Grigi" },
  { key: "neri", label: "Neri" },
  { key: "marroni", label: "Marroni" },
  { key: "beige", label: "Beige / Avorio" },
  { key: "verdi", label: "Verdi" },
  { key: "bronzo", label: "Bronzo / Oro" },
  { key: "speciali", label: "Colori Speciali" },
];

interface RalColorPickerProps {
  colorMode: ColorMode;
  onColorModeChange: (m: ColorMode) => void;
  ralValue: string | null;
  onRalChange: (c: RalColor) => void;
  woodValue: string | null;
  onWoodChange: (e: WoodEffect) => void;
  label?: string;
  showCustomRal?: boolean;
}

export function RalColorPicker({
  colorMode, onColorModeChange,
  ralValue, onRalChange,
  woodValue, onWoodChange,
  label, showCustomRal = false,
}: RalColorPickerProps) {
  const [openGroup, setOpenGroup] = useState<string>("popular");
  const [customRal, setCustomRal] = useState("");

  const selectedRal = RAL_COLORS.find(c => c.ral === ralValue);
  const selectedWood = WOOD_EFFECTS.find(e => e.id === woodValue);

  const getGroupColors = (group: string) =>
    group === "popular"
      ? RAL_COLORS.filter(c => c.popular)
      : RAL_COLORS.filter(c => c.group === group);

  return (
    <div className="space-y-3">
      {label && <label className="text-sm font-semibold block">{label}</label>}

      {/* Tab switcher */}
      <div className="flex rounded-xl border border-border overflow-hidden">
        <button
          onClick={() => onColorModeChange("ral")}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            colorMode === "ral"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-muted/50"
          }`}
        >
          🎨 Colori RAL
        </button>
        <button
          onClick={() => onColorModeChange("legno")}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            colorMode === "legno"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-muted/50"
          }`}
        >
          🌳 Effetti Legno
        </button>
      </div>

      {/* RAL Tab */}
      {colorMode === "ral" && (
        <div className="space-y-2">
          {/* Selected preview */}
          {selectedRal && (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5">
              <div className="w-8 h-8 rounded-lg border border-border" style={{ backgroundColor: selectedRal.hex }} />
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">{selectedRal.name}</span>
                <span className="text-xs text-muted-foreground block">RAL {selectedRal.ral} · {selectedRal.hex}</span>
              </div>
              <Check className="w-4 h-4 text-primary flex-shrink-0" />
            </div>
          )}

          {/* Groups */}
          {RAL_GROUPS.map(group => {
            const colors = getGroupColors(group.key);
            if (!colors.length) return null;
            const isOpen = openGroup === group.key;
            return (
              <div key={group.key} className="border rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenGroup(isOpen ? "" : group.key)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex gap-0.5">
                    {colors.slice(0, 5).map(c => (
                      <div key={c.ral} className="w-4 h-4 rounded-sm border border-border/50" style={{ backgroundColor: c.hex }} />
                    ))}
                  </div>
                  <span className="text-xs font-medium text-foreground flex-1 text-left">{group.label}</span>
                  <span className="text-[10px] text-muted-foreground">({colors.length})</span>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {isOpen && (
                  <div className="grid grid-cols-5 gap-1.5 p-2">
                    {colors.map(color => (
                      <button
                        key={color.ral}
                        onClick={() => onRalChange(color)}
                        className={`group relative flex flex-col items-center gap-1 p-1.5 rounded-lg transition-all ${
                          ralValue === color.ral && colorMode === "ral" ? "ring-2 ring-primary ring-offset-1" : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="w-9 h-9 rounded-lg border border-border relative" style={{ backgroundColor: color.hex }}>
                          {ralValue === color.ral && colorMode === "ral" && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 text-white drop-shadow-md" />
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] text-muted-foreground leading-none">{color.ral}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Custom RAL */}
          {showCustomRal && (
            <div className="flex gap-2 items-center pt-1">
              <input
                placeholder="RAL personalizzato"
                value={customRal}
                onChange={e => setCustomRal(e.target.value.replace(/\D/g, ""))}
                maxLength={4}
                className="flex-1 h-9 px-3 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={() => {
                  if (customRal.length >= 3) {
                    onRalChange({ ral: customRal, name: `RAL ${customRal}`, hex: "#888888", group: "speciali" });
                  }
                }}
                className="px-4 h-9 text-sm bg-primary text-primary-foreground rounded-lg font-medium"
              >
                Usa
              </button>
            </div>
          )}
        </div>
      )}

      {/* Wood Effects Tab */}
      {colorMode === "legno" && (
        <div className="space-y-3">
          {/* Selected preview */}
          {selectedWood && (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5">
              <div className="w-8 h-8 rounded-lg border border-border overflow-hidden" style={{
                background: `repeating-linear-gradient(90deg, ${selectedWood.base_hex} 0px, ${selectedWood.base_hex} 3px, ${selectedWood.grain_hex} 3px, ${selectedWood.grain_hex} 4px)`
              }} />
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">{selectedWood.name}</span>
                <span className="text-xs text-muted-foreground block">{selectedWood.name_en} · Effetto legno PVC</span>
              </div>
              <Check className="w-4 h-4 text-primary flex-shrink-0" />
            </div>
          )}

          {/* Popular */}
          <div>
            <span className="text-xs font-semibold text-muted-foreground block mb-2">⭐ Più richiesti</span>
            <div className="grid grid-cols-3 gap-2">
              {WOOD_EFFECTS.filter(e => e.popular).map(effect => (
                <button
                  key={effect.id}
                  onClick={() => onWoodChange(effect)}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border text-center transition-all ${
                    woodValue === effect.id && colorMode === "legno"
                      ? "border-primary ring-1 ring-primary bg-primary/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg border border-border/50" style={{
                    background: `repeating-linear-gradient(90deg, ${effect.base_hex} 0px, ${effect.base_hex} 3px, ${effect.grain_hex} 3px, ${effect.grain_hex} 4px)`
                  }} />
                  <span className="text-[11px] font-medium text-foreground leading-tight">{effect.name}</span>
                  {woodValue === effect.id && colorMode === "legno" && <Check className="w-3 h-3 text-primary" />}
                </button>
              ))}
            </div>
          </div>

          {/* All */}
          <div>
            <span className="text-xs font-semibold text-muted-foreground block mb-2">Tutti gli effetti</span>
            <div className="grid grid-cols-4 gap-2">
              {WOOD_EFFECTS.filter(e => !e.popular).map(effect => (
                <button
                  key={effect.id}
                  onClick={() => onWoodChange(effect)}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border text-center transition-all ${
                    woodValue === effect.id && colorMode === "legno"
                      ? "border-primary ring-1 ring-primary bg-primary/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg border border-border/50" style={{
                    background: `repeating-linear-gradient(90deg, ${effect.base_hex} 0px, ${effect.base_hex} 3px, ${effect.grain_hex} 3px, ${effect.grain_hex} 4px)`
                  }} />
                  <span className="text-[10px] font-medium text-foreground leading-tight">{effect.name}</span>
                  {woodValue === effect.id && colorMode === "legno" && <Check className="w-3 h-3 text-primary" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
