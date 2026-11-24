import { DoorOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { nomeEsitoAccesso, type EsitoAccesso } from "@/lib/planimetrie/accessiPlanimetria";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function AccessiProposta({accessi,className}: {accessi:Array<EsitoAccesso & {piano?:string}>;className?:string}) {
  const t = useT();
  if (!accessi.length) return null;
  return <section aria-label={t("Controllo degli accessi")} className={cn("rounded-lg border bg-card p-3",className)}>
    <h4 className="flex items-center gap-1.5 text-xs font-semibold"><DoorOpen className="h-3.5 w-3.5 text-primary"/>{t("Controllo degli accessi")}</h4>
    <ul className="mt-2 divide-y text-xs">
      {accessi.map(a=><li key={a.localeId} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 py-1.5">
        <span className="font-medium">{a.nome}{(a.dettaglio || a.piano) && <span className="ml-1 font-normal text-muted-foreground">· {[a.dettaglio, a.piano].filter(Boolean).join(" · ")}</span>}</span>
        <span className={cn("font-medium",a.esito==="collegato" ? "text-teal-800 dark:text-teal-200" : "text-amber-800 dark:text-amber-200")}>{nomeEsitoAccesso(a.esito)}</span>
      </li>)}
    </ul>
    <p className="mt-1 text-[11px] text-muted-foreground">{t("Le porte e i varchi disegnati mostrano i collegamenti interni. Registra il percorso dalla strada e gli eventuali passaggi tra piani nel fascicolo.")}</p>
  </section>;
}
