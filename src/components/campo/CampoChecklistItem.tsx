/**
 * Singolo item della checklist sicurezza.
 * Touch target >= 48px, feedback visivo immediato al tap.
 */
import {
  HardHat,
  ShieldAlert,
  TriangleAlert,
  Flame,
  HeartPulse,
  DoorOpen,
  Layers,
  Cloud,
  Shirt,
  Hand,
  Link2,
  Check,
  Camera,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ChecklistItemDef } from "@/lib/campo/checklist-items";

const ICON_MAP: Record<string, LucideIcon> = {
  "hard-hat": HardHat,
  boot: ShieldAlert,
  hand: Hand,
  link: Link2,
  shirt: Shirt,
  "triangle-alert": TriangleAlert,
  sign: ShieldAlert,
  flame: Flame,
  "heart-pulse": HeartPulse,
  "door-open": DoorOpen,
  layers: Layers,
  cloud: Cloud,
};

interface CampoChecklistItemProps {
  item: ChecklistItemDef;
  checked: boolean;
  fotoUrl?: string;
  onToggle: () => void;
  onFotoClick?: () => void;
}

export default function CampoChecklistItem({
  item,
  checked,
  fotoUrl,
  onToggle,
  onFotoClick,
}: CampoChecklistItemProps): JSX.Element {
  const Icon = ICON_MAP[item.iconKey] ?? ShieldAlert;

  return (
    <div
      className={`
        flex items-center gap-3 rounded-xl border-2 p-4 transition-all
        ${checked
          ? "border-emerald-500 bg-emerald-950/40"
          : item.critico
            ? "border-slate-700 bg-slate-900"
            : "border-slate-800 bg-slate-900/50"
        }
      `}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        aria-label={`${checked ? "Togli spunta" : "Spunta"}: ${item.label}`}
        className={`
          flex-none w-12 h-12 rounded-xl flex items-center justify-center
          transition-all active:scale-95
          ${checked
            ? "bg-emerald-500 text-slate-950"
            : "bg-slate-800 text-slate-400 border border-slate-700"
          }
        `}
      >
        {checked ? <Check className="w-6 h-6" strokeWidth={3} /> : <Icon className="w-6 h-6" />}
      </button>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white leading-tight">
          {item.label}
        </p>
        {item.critico && !checked && (
          <p className="text-[11px] text-amber-400 mt-0.5">Obbligatorio</p>
        )}
        {fotoUrl && (
          <p className="text-[11px] text-emerald-400 mt-0.5 truncate">
            Foto allegata ✓
          </p>
        )}
      </div>

      {item.fotoRichiesta && onFotoClick && (
        <button
          type="button"
          onClick={onFotoClick}
          aria-label="Scatta foto"
          className={`
            flex-none w-12 h-12 rounded-xl flex items-center justify-center
            transition-all active:scale-95
            ${fotoUrl
              ? "bg-emerald-600/20 border border-emerald-500 text-emerald-400"
              : "bg-slate-800 border border-slate-700 text-slate-400"
            }
          `}
        >
          <Camera className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
