import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { documentiDb as db } from "@/lib/ddt/documentiPersistenti";
import { messaggioSalvataggio } from "@/lib/fatturazione/salvataggioFattura";
export function EquivalenzeFornitoreFattura({
  regole,
  puoModificare,
}: {
  regole: Record<string, unknown>[];
  puoModificare: boolean;
}) {
  const qc = useQueryClient();
  const togli = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("fattura_equivalenza_disattiva", {
        p_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["fattura-riconciliazione-ai"] }),
  });
  if (!regole.length) return null;
  return (
    <details className="border-t px-5 py-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer">
        Equivalenze ricordate per questo fornitore ({regole.length})
      </summary>
      <p className="my-2">
        Vengono usate nelle prossime analisi della tua azienda. Puoi disattivare
        quelle non più valide.
      </p>
      {togli.error && (
        <p role="alert" className="text-red-700">
          {messaggioSalvataggio(togli.error)}
        </p>
      )}
      <ul className="max-h-44 overflow-y-auto divide-y">
        {regole.map((r) => (
          <li key={String(r.id)} className="flex items-center gap-3 py-2">
            <span
              className="min-w-0 flex-1 truncate"
              title={`${r.fattura_descrizione} → ${r.documento_descrizione}`}
            >
              {String(r.fattura_descrizione)} →{" "}
              {String(r.documento_descrizione)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={!puoModificare || togli.isPending}
              onClick={() => togli.mutate(String(r.id))}
            >
              Disattiva
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
