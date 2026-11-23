import { Check, ChevronDown, Lock } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Accesso diretto alle fasi anche quando la striscia scorre su telefono e tablet. */
export function SelettoreFase({ passi, corrente, onSelect }: {
  passi: Array<{ key: string; label: string; breve?: string; bloccato?: boolean; completato?: boolean; avviso?: boolean }>;
  corrente: string;
  onSelect: (key: string) => void;
}) {
  const t = useT();
  if (passi.length < 2) return null;
  const indice = Math.max(0, passi.findIndex(p => p.key === corrente));
  const passoAttivo = passi[indice];
  return <div className="flex min-w-0 flex-1 items-center px-2 py-1 lg:ml-1 lg:flex-none lg:border-l lg:border-slate-200 lg:py-0 lg:pl-1 xl:hidden">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t("Scegli passo del preventivo, {n} di {totale}", { n: indice + 1, totale: passi.length })}
          className="inline-flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:min-w-14 lg:justify-center lg:gap-1">
          <span className="min-w-0 flex-1 truncate text-left lg:hidden">{passoAttivo.breve ?? passoAttivo.label}</span>
          <span className="tabular-nums text-slate-600">{indice + 1}/{passi.length}</span>
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[min(70dvh,var(--radix-dropdown-menu-content-available-height))] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain">
        {passi.map((passo, i) => <DropdownMenuItem key={passo.key} disabled={passo.bloccato}
          aria-current={passo.key === corrente ? "step" : undefined}
          aria-label={passo.bloccato ? t("{n}. {fase}, bloccato", { n: i + 1, fase: passo.label }) : passo.avviso ? t("{n}. {fase}, da completare", { n: i + 1, fase: passo.label }) : passo.completato ? t("{n}. {fase}, completato", { n: i + 1, fase: passo.label }) : `${i + 1}. ${passo.label}`}
          onSelect={() => onSelect(passo.key)}
          className={cn("min-h-11 gap-2", passo.key === corrente && "bg-orange-50 font-semibold text-orange-800")}>
          <span className="w-5 shrink-0 text-center text-xs tabular-nums">{i + 1}</span>
          <span className="min-w-0 flex-1 whitespace-normal">{passo.label}</span>
          {passo.bloccato ? <Lock className="h-4 w-4" aria-label={t("Bloccato")} />
            : passo.avviso ? <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" role="img" aria-label={t("Da completare")} />
            : passo.completato && <Check className="h-4 w-4 text-emerald-700" aria-label={t("Completato")} />}
        </DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
