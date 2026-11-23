import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CorreggiRapportino } from "./CorreggiRapportino";
import { AnnullaRapportinoDialog, useDecisioneRapportino } from "./DecisioneRapportino";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** La rimozione usa l'annullamento contabile, conservando storico e riferimenti. */
export function AzioniRapportino({ report, orderId, onFatto }: {
  report: { id: string; updated_at?: string | null; annullato_at?: string | null; approvato?: boolean | null; stato?: string | null; ufficio_employee_id?: string | null };
  orderId: string; onFatto?: () => void;
}) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const { canApprove, annullaMutation } = useDecisioneRapportino(orderId, {
    onAnnullato: () => { setAperto(false); setMotivo(""); onFatto?.(); },
  });
  if (!canApprove || report.annullato_at) return null;
  const elimina = !report.approvato && report.stato !== "approvato";
  return <>
    {!(report.ufficio_employee_id && report.stato === "rifiutato") && <CorreggiRapportino rapportinoId={report.id} orderId={orderId} onCorretto={onFatto} />}
    <Button type="button" size="sm" variant="outline" className="text-red-700" disabled={!report.updated_at} onClick={() => setAperto(true)}>
      {elimina ? t("Elimina rapportino") : t("Annulla rapportino")}
    </Button>
    {aperto && report.updated_at && <AnnullaRapportinoDialog elimina={elimina} motivo={motivo} onMotivo={setMotivo} busy={annullaMutation.isPending}
      rapportino={{ id: report.id, updatedAt: report.updated_at }}
      onClose={() => { if (!annullaMutation.isPending) setAperto(false); }}
      onConferma={(anteprima) => annullaMutation.mutate({ id: report.id, updatedAt: report.updated_at!, motivo, ...(anteprima ? { anteprima } : {}) })} />}
  </>;
}
