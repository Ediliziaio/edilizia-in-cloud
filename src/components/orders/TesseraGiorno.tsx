/**
 * Il giorno come una tessera di calendario (giorno grande, mese, anno), col colore che dice a che punto
 * è il documento. La usano l'elenco dei rapportini e quello dei rendiconti al committente: le due schede
 * della commessa si leggono uguali, e la data non si taglia mai.
 */
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

export const fmtSafeDate = (value: string | null | undefined, pattern: string) => {
  if (!value) return "—";
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return format(parsed, pattern, { locale: dateFnsCampo() });
};

export function TesseraGiorno({ data, classe }: { data: string | null | undefined; classe: string }) {
  return (
    <div className={cn("flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg ring-1", classe)}>
      <span className="text-lg font-bold leading-none tabular-nums">{fmtSafeDate(data, "d")}</span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide">{fmtSafeDate(data, "MMM")}</span>
      <span className="mt-0.5 text-[9px] leading-none opacity-70">{fmtSafeDate(data, "yyyy")}</span>
    </div>
  );
}
