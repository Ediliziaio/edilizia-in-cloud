/**
 * SilvioAvatar — fonte di verità UNICA per l'icona di Silvio.
 * Usa il mascotte ufficiale del brand (immagini in /public, ritagliate al solo
 * volto). Per cambiare l'icona ovunque si sostituisce SOLO il file in public/.
 *
 * Adattiva alla superficie:
 *   <SilvioAvatar />                 // BIANCO (default) — chip chiaro con bordo: sta bene su sfondi chiari
 *   <SilvioAvatar bg="navy" />       // disco navy — per superfici colorate/scure (es. FAB arancione)
 *   <SilvioAvatar bg="orange" />     // disco arancione
 *   <SilvioAvatar size={48} />       // dimensione in px
 */
import { cn } from "@/lib/utils";

export type SilvioAvatarBg = "gradient" | "light" | "navy" | "none" | "orange" | "white";

const SRC: Record<"navy" | "orange" | "white", string> = {
  navy: "/silvio-avatar.png",
  orange: "/silvio-avatar-orange.png",
  white: "/silvio-avatar-white.png",
};

interface SilvioAvatarProps {
  /** Dimensione in px (quadrato → reso circolare). Default 40. */
  size?: number;
  /** Variante cromatica del chip. Default "white" (chip chiaro adatto a sfondi chiari). */
  bg?: SilvioAvatarBg;
  className?: string;
  title?: string;
}

export function SilvioAvatar({ size = 40, bg = "white", className, title = "Silvio AI" }: SilvioAvatarProps) {
  const variant: "navy" | "orange" | "white" =
    bg === "orange" ? "orange" : bg === "navy" || bg === "none" || bg === "gradient" ? "navy" : "white";

  // La variante bianca su sfondo chiaro sparirebbe: bordo + ombra leggera la definiscono.
  const frame = variant === "white" ? "ring-1 ring-slate-200 shadow-sm bg-white" : "";

  return (
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
      className={cn("shrink-0 select-none object-cover", frame, className, "rounded-full")}
    />
  );
}

export default SilvioAvatar;
