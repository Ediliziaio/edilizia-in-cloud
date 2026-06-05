/**
 * SilvioAvatar — fonte di verità UNICA per l'icona di Silvio.
 * Usa il mascotte ufficiale del brand (immagini in /public, ritagliate al solo
 * volto). Per cambiare l'icona ovunque si sostituisce SOLO il file in public/.
 *
 * Adattiva alla superficie:
 *   <SilvioAvatar />                       // BIANCO (default) — chip chiaro su sfondi chiari
 *   <SilvioAvatar bg="navy" />             // disco navy — superfici colorate/scure
 *   <SilvioAvatar bg="orange" />           // disco arancione — es. FAB
 *
 * Animazioni (l'icona è raster: si anima il chip, non i tratti interni):
 *   <SilvioAvatar animated="idle" />       // leggero "respiro" (vivo)
 *   <SilvioAvatar animated="thinking" />   // rimbalzo + alone pulsante (Silvio elabora)
 */
import { cn } from "@/lib/utils";

export type SilvioAvatarBg = "gradient" | "light" | "navy" | "none" | "orange" | "white";
export type SilvioAvatarAnim = false | "idle" | "thinking";

const SRC: Record<"navy" | "orange" | "white", string> = {
  navy: "/silvio-avatar.png",
  orange: "/silvio-avatar-orange.png",
  white: "/silvio-avatar-white.png",
};

interface SilvioAvatarProps {
  /** Dimensione in px (quadrato → reso circolare). Default 40. */
  size?: number;
  /** Variante cromatica del chip. Default "white". */
  bg?: SilvioAvatarBg;
  /** Animazione: "idle" (respiro) o "thinking" (rimbalzo + alone). Default off. */
  animated?: SilvioAvatarAnim;
  className?: string;
  title?: string;
}

export function SilvioAvatar({
  size = 40,
  bg = "white",
  animated = false,
  className,
  title = "Silvio AI",
}: SilvioAvatarProps) {
  const variant: "navy" | "orange" | "white" =
    bg === "orange" ? "orange" : bg === "navy" || bg === "none" || bg === "gradient" ? "navy" : "white";

  // La variante bianca su sfondo chiaro sparirebbe: bordo + ombra leggera la definiscono.
  const frame = variant === "white" ? "ring-1 ring-slate-200 shadow-sm bg-white" : "";
  const motionClass = animated === "idle" ? "animate-silvio-breathe" : animated === "thinking" ? "animate-silvio-bob" : "";

  const img = (
    <img
      src={SRC[variant]}
      alt={title}
      title={title}
      width={size}
      height={size}
      draggable={false}
      loading="lazy"
      decoding="async"
      style={{ width: size, height: size }}
      // rounded-full per ultimo → vince sempre (cn usa tailwind-merge): avatar circolare
      className={cn("shrink-0 select-none object-cover", frame, motionClass, animated !== "thinking" && className, "rounded-full")}
    />
  );

  // "thinking": alone arancione pulsante dietro al volto (Silvio sta elaborando).
  if (animated === "thinking") {
    return (
      <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
        <span className="absolute -inset-1 rounded-full bg-orange-400/40 animate-silvio-ring" aria-hidden />
        {img}
      </span>
    );
  }

  return img;
}

export default SilvioAvatar;
