/**
 * SilvioAvatar — fonte di verità UNICA per l'identità visiva di Silvio.
 * Mark vettoriale (volto che fa l'occhiolino + cravatta + scintilla) ispirato al
 * mascotte di brand: nitido a ogni dimensione, themeable, zero asset binari.
 *
 * Sostituisce l'uso sparso di Sparkles / Brain / BrainCircuit / ✨. Per cambiare
 * l'icona ovunque si tocca SOLO questo file.
 *
 *   <SilvioAvatar />                       // chip arancione + volto bianco (default)
 *   <SilvioAvatar size={28} bg="none" />   // solo mark, eredita currentColor (es. dentro il FAB)
 *   <SilvioAvatar bg="light" />            // crema + tratti navy (superfici chiare)
 *   <SilvioAvatar bg="navy" />             // navy + tratti bianchi + accenti arancioni
 */
import { useId } from "react";
import { cn } from "@/lib/utils";

export type SilvioAvatarBg = "gradient" | "light" | "navy" | "none";

interface SilvioAvatarProps {
  /** Lato in px (quadrato). Default 40. */
  size?: number;
  /** Sfondo del chip. "none" = solo il volto (eredita currentColor). */
  bg?: SilvioAvatarBg;
  className?: string;
  title?: string;
}

const NAVY = "#1B2A4A";
const ORANGE = "#F97316";

export function SilvioAvatar({ size = 40, bg = "gradient", className, title = "Silvio AI" }: SilvioAvatarProps) {
  const uid = useId().replace(/:/g, "");
  const stroke = bg === "light" ? NAVY : bg === "none" ? "currentColor" : "#FFFFFF";
  const accent = bg === "gradient" ? "#FFFFFF" : bg === "none" ? "currentColor" : ORANGE;
  const showCircle = bg !== "none";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
    >
      <title>{title}</title>
      {bg === "gradient" && (
        <defs>
          <linearGradient id={`silvio-g-${uid}`} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FB923C" />
            <stop offset="1" stopColor="#F97316" />
          </linearGradient>
        </defs>
      )}
      {showCircle && (
        <circle
          cx="24"
          cy="24"
          r="24"
          fill={bg === "gradient" ? `url(#silvio-g-${uid})` : bg === "navy" ? NAVY : "#FFF7ED"}
        />
      )}
      {/* Spalle / giacca */}
      <path d="M12 40c1.4-5.2 6.2-7.6 12-7.6S34.6 34.8 36 40" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Bavero a V */}
      <path d="M19 32.5l5 5 5-5" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Cravatta */}
      <path d="M24 32.8l-1.9 2.5L24 41l1.9-5.7z" fill={accent} />
      {/* Testa */}
      <circle cx="24" cy="19" r="11" stroke={stroke} strokeWidth="2.2" />
      {/* Ciuffo */}
      <path d="M15.6 12.6c2.1-5 9-6.4 12.9-2.4" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      {/* Occhio aperto (destra) */}
      <circle cx="28" cy="18" r="1.5" fill={stroke} />
      {/* Occhiolino (sinistra) */}
      <path d="M17.6 18.1c1.4 1.5 3.1 1.5 4.5 0" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      {/* Sorriso */}
      <path d="M18.8 23.4c2.6 2.7 7.8 2.7 10.4 0" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      {/* Scintilla */}
      <path d="M37.2 7.5l1.05 2.85 2.85 1.05-2.85 1.05L37.2 16.3l-1.05-2.85L33.3 12.4l2.85-1.05z" fill={accent} />
    </svg>
  );
}

export default SilvioAvatar;
