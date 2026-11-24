import { previewPayload } from "@/lib/commercialista/anteprimaRichiesta";
import type { ChangeRequestRow } from "@/hooks/accountant/useAccountantChangeRequests";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function RichiestaStudioDettagli({ richiesta }: { richiesta: ChangeRequestRow }) {
  const t = useT();
  const { payload } = richiesta;
  if (!["proposta", "commessa_descrizione"].includes(richiesta.resource_type)) {
    return <p className="mt-2 break-words text-xs text-muted-foreground">{previewPayload(payload)}</p>;
  }
  return <div className="mt-2 space-y-2 text-sm">
    {typeof payload.commessa === "string" && <p className="font-medium">{t("Commessa {commessa}", { commessa: String(payload.commessa ?? "") })}</p>}
    <dl className="grid gap-2 sm:grid-cols-2">
      {richiesta.resource_type === "commessa_descrizione" && <div className="min-w-0 rounded-md border bg-muted/25 p-2">
        <dt className="text-xs font-medium">{t("Descrizione attuale all’invio")}</dt>
        <dd className="whitespace-pre-wrap break-words text-muted-foreground">{String(payload.precedente ?? "—")}</dd>
      </div>}
      <div className="min-w-0 rounded-md border bg-muted/25 p-2">
        <dt className="text-xs font-medium">{t("Proposta dello studio")}</dt>
        <dd className="whitespace-pre-wrap break-words">{String(payload.description ?? "—")}</dd>
      </div>
    </dl>
    {typeof payload.motivo === "string" && <p className="whitespace-pre-wrap break-words text-muted-foreground">{payload.motivo}</p>}
  </div>;
}
