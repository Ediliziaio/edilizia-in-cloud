import { cn } from "@/lib/utils";

export interface VoceContatore { chiave: string; etichetta: string; valore: number; avviso?: boolean }

/** I numeri in cima alle viste dei materiali: si leggono a colpo d'occhio e un clic filtra l'elenco sotto. */
export function ContatoriFiltro({ voci, attivo, onScegli, etichetta, className }: {
  voci: VoceContatore[]; attivo: string | null; onScegli: (chiave: string | null) => void; etichetta: string; className?: string;
}) {
  return (
    <div role="group" aria-label={etichetta} className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5", className)}>
      {voci.map(v => (
        <button key={v.chiave} type="button" disabled={v.valore === 0} aria-pressed={attivo === v.chiave}
          onClick={() => onScegli(attivo === v.chiave ? null : v.chiave)}
          className={cn("rounded-md border border-transparent p-2 text-left transition-colors enabled:hover:bg-accent", attivo === v.chiave && "border-primary bg-primary/5")}>
          <span className="block text-xs text-muted-foreground">{v.etichetta}</span>
          <span className={cn("mt-1 block text-lg font-semibold tabular-nums", v.avviso && v.valore > 0 && "text-amber-700 dark:text-amber-400")}>{v.valore}</span>
        </button>
      ))}
    </div>
  );
}
