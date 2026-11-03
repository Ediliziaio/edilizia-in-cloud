import { Eye, Lock, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  accessiEffettivi,
  nomiPermessi,
  vociAccesePerArea,
  type AreaRiepilogo,
} from "@/lib/permessi/accessiEffettivi";

interface Props {
  nome: string;
  permessi: Record<string, unknown>;
  aree: readonly AreaRiepilogo[];
  solaLettura?: boolean;
}

/** «Cosa vede davvero»: chiusa di partenza, non cambia nulla per chi non la apre. */
export function AnteprimaAccessi({ nome, permessi, aree, solaLettura }: Props) {
  const accessi = accessiEffettivi(permessi);
  const voci = vociAccesePerArea(aree, permessi);
  const aperte = accessi.filter((a) => a.aperta).length;

  return (
    <details className="group rounded-lg border bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-sm font-medium">
        <span className="flex min-w-0 items-center gap-2">
          <Eye className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">Cosa vede davvero {nome}</span>
        </span>
        <Badge variant={aperte > 0 ? "default" : "secondary"} className="shrink-0 tabular-nums">
          {aperte} {aperte === 1 ? "area sensibile" : "aree sensibili"}
        </Badge>
      </summary>
      <div className="space-y-4 border-t p-3">
        {solaLettura && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            È in sola lettura: vede queste aree ma non può cambiare i dati.
          </p>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dati sensibili</p>
          <ul className="space-y-1.5">
            {accessi.map(({ area, aperta, apertaDa }) => (
              <li key={area.id} className="flex items-start gap-2 text-sm">
                {aperta ? (
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                ) : (
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="min-w-0">
                  <span className="font-medium">{area.etichetta}</span>
                  <span className="text-muted-foreground">{aperta ? ": la vede" : ": non la vede"}</span>
                  {aperta && (
                    <span className="block text-xs text-muted-foreground">
                      Si apre con: {nomiPermessi(apertaDa, aree).join(", ")}.
                      {" "}Per chiuderla vanno spenti tutti.
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sezioni aperte</p>
          {voci.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna sezione accesa.</p>
          ) : (
            <ul className="space-y-1">
              {voci.map((area) => (
                <li key={area.id} className="text-sm">
                  <span className="font-medium">{area.label}:</span>{" "}
                  <span className="text-muted-foreground">{area.voci.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}
