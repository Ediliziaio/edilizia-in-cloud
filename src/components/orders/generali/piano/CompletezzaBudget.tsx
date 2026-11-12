import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useModificaVoce } from "@/hooks/useGeneralePiano";
import { controllaBudget } from "@/lib/orders/generali/budgetCompletezza";
import type { VocePiano } from "@/lib/orders/generali/pianoConti";

export function CompletezzaBudget({
  generaleId,
  versioneId,
  voci,
  modificabile,
}: {
  generaleId: string;
  versioneId: string;
  voci: VocePiano[];
  modificabile: boolean;
}) {
  const modifica = useModificaVoce(generaleId, versioneId);
  const c = controllaBudget(voci);
  if (c.completo)
    return (
      <p className="generale-budget-complete text-xs text-emerald-700" role="status">
        Non risultano stime o scadenze mancanti nel budget.
      </p>
    );
  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <h3 className="font-semibold">Budget da completare · approvazione bloccata</h3>
      <ul className="list-disc pl-5">
        {c.problemi.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      {c.mancanti.length > 0 && (
        <details>
          <summary className="cursor-pointer">Voci senza stima ({c.mancanti.length})</summary>
          <p className="my-2 text-xs">
            Compila il previsto nella tabella. Se la voce non comporta costi, conferma esplicitamente lo zero.
          </p>
          {c.mancanti.map((v) => (
            <div
              key={v.descrizione + v.id}
              className="flex items-center justify-between gap-2 border-t border-amber-200 py-1"
            >
              <span>{v.descrizione}</span>
              {modificabile && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={modifica.isPending}
                  onClick={() =>
                    modifica.mutate(
                      { id: v.id, modifica: { importo: 0 } },
                      { onError: (e) => toast.error(e instanceof Error ? e.message : "Stima non salvata") },
                    )
                  }
                >
                  Conferma zero
                </Button>
              )}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
