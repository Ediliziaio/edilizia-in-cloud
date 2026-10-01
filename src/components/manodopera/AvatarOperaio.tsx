import { cn } from "@/lib/utils";

/** Iniziali su fondo colorato, come nel Personale; pallino facoltativo per lo stato. */
export function AvatarOperaio({
  nome,
  cognome,
  colore,
  pallino,
  grande = false,
}: {
  nome: string | null | undefined;
  cognome: string | null | undefined;
  colore: string | null | undefined;
  /** Classe di colore del pallino (es. bg-emerald-500); nessun pallino se assente. */
  pallino?: string;
  grande?: boolean;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <span
        aria-hidden="true"
        className={cn(
          "flex items-center justify-center rounded-full font-bold text-white",
          grande ? "h-12 w-12 text-base" : "h-8 w-8 text-xs",
        )}
        style={{ backgroundColor: colore || "#64748B" }}
      >
        {(nome?.[0] ?? "").toUpperCase()}{(cognome?.[0] ?? "").toUpperCase()}
      </span>
      {pallino && (
        <span
          aria-hidden="true"
          className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background", pallino)}
        />
      )}
    </span>
  );
}
