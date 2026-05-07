/**
 * CanvaColorPicker — color picker stile Canva.
 *
 * Per ogni colore offre:
 *  • Swatch grandi cliccabili (8 preset di brand)
 *  • Picker nativo HTML5 per scegliere qualunque colore
 *  • Input HEX manuale con validazione
 *  • Storia "Colori recenti" persistita in localStorage
 *
 * Pattern compatto: trigger = pillola colorata. Click → popover con tutto.
 */
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const RECENT_KEY = "edilizia.template.recent_colors";
const RECENT_MAX = 10;

const QUICK_COLORS = [
  "#FFFFFF", "#000000", "#1F2937", "#4B5563", "#9CA3AF",
  "#FEE2E2", "#FECACA", "#EF4444", "#B91C1C", "#7F1D1D",
  "#FED7AA", "#FB923C", "#EA580C", "#C2410C", "#7C2D12",
  "#FEF3C7", "#FDE047", "#EAB308", "#A16207", "#713F12",
  "#D1FAE5", "#34D399", "#10B981", "#047857", "#064E3B",
  "#CFFAFE", "#22D3EE", "#0891B2", "#155E75", "#083344",
  "#DBEAFE", "#60A5FA", "#2563EB", "#1E40AF", "#1E3A8A",
  "#EDE9FE", "#A78BFA", "#7C3AED", "#5B21B6", "#3B0764",
  "#FCE7F3", "#F472B6", "#DB2777", "#9D174D", "#500724",
];

function isValidHex(s: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(s);
}

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string" && isValidHex(s)).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(color: string): string[] {
  if (!isValidHex(color)) return loadRecent();
  const cur = loadRecent().filter((c) => c.toLowerCase() !== color.toLowerCase());
  const next = [color, ...cur].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* noop */ }
  return next;
}

interface Props {
  /** Etichetta breve mostrata sopra il trigger. */
  label?: string;
  /** Hint sotto-etichetta. */
  hint?: string;
  value: string;
  onChange: (hex: string) => void;
  /** Stile compatto (solo pillola, senza label sopra). */
  compact?: boolean;
}

export function CanvaColorPicker({ label, hint, value, onChange, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [hexInput, setHexInput] = useState(value);

  const commit = (color: string) => {
    if (!isValidHex(color)) return;
    onChange(color);
    setRecent(pushRecent(color));
    setHexInput(color);
  };

  return (
    <div className={compact ? "" : "space-y-1"}>
      {!compact && label && (
        <div className="flex items-baseline justify-between">
          <Label className="text-xs font-medium text-slate-700">{label}</Label>
          {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
        </div>
      )}
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setHexInput(value); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "group flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 hover:border-slate-300 hover:shadow-sm transition-all w-full",
              open && "border-orange-400 ring-2 ring-orange-100",
            )}
            title={`${label ?? "Colore"}: ${value}`}
          >
            <span
              className="h-6 w-6 rounded-md border border-slate-200 shadow-inner shrink-0"
              style={{ backgroundColor: value }}
            />
            <span className="font-mono text-[11px] text-slate-600 uppercase">{value}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={6}
          className="w-[300px] p-0 border-slate-200 shadow-2xl rounded-xl overflow-hidden"
        >
          <div className="px-3 py-2.5 border-b bg-gradient-to-br from-orange-50 to-amber-50">
            <p className="text-xs font-semibold text-slate-800">{label ?? "Scegli colore"}</p>
            {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
          </div>
          <div className="p-3 space-y-3 max-h-[440px] overflow-y-auto">
            {/* HEX input + native picker */}
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={value}
                onChange={(e) => commit(e.target.value)}
                className="h-9 w-9 rounded-md border border-slate-200 cursor-pointer shrink-0"
                aria-label="Selettore colore avanzato"
              />
              <div className="flex-1">
                <Input
                  value={hexInput}
                  onChange={(e) => setHexInput(e.target.value)}
                  onBlur={() => isValidHex(hexInput) && commit(hexInput)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && isValidHex(hexInput)) commit(hexInput); }}
                  placeholder="#FFFFFF"
                  className="h-9 font-mono text-xs uppercase"
                  maxLength={7}
                />
              </div>
            </div>
            {/* Recent */}
            {recent.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5 font-semibold">Recenti</p>
                <div className="grid grid-cols-10 gap-1">
                  {recent.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => commit(c)}
                      className="h-6 w-6 rounded-md border border-slate-200 hover:scale-110 hover:shadow-md transition-all"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            )}
            {/* Preset */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5 font-semibold">Palette</p>
              <div className="grid grid-cols-10 gap-1">
                {QUICK_COLORS.map((c) => {
                  const isActive = c.toLowerCase() === value.toLowerCase();
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => commit(c)}
                      className={cn(
                        "h-6 w-6 rounded-md border transition-all hover:scale-110 hover:shadow-md",
                        isActive ? "border-orange-500 ring-2 ring-orange-200" : "border-slate-200",
                      )}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
