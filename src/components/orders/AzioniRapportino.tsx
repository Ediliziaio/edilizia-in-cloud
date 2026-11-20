import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CorreggiRapportino } from "./CorreggiRapportino";
import { AnnullaRapportinoDialog, useDecisioneRapportino } from "./DecisioneRapportino";

/** La rimozione usa l'annullamento contabile, conservando storico e riferimenti. */
export function AzioniRapportino({ report, orderId, onFatto }: {
  report: { id: string; updated_at?: string | null; annullato_at?: string | null; approvato?: boolean | null; stato?: string | null; ufficio_employee_id?: string | null };
  orderId: string; onFatto?: () => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const { canApprove, annullaMutation } = useDecisioneRapportino(orderId, {
    onAnnullato: () => { setAperto(false); setMotivo(""); onFatto?.(); },
  });
  if (!canApprove || report.annullato_at) return null;
  const elimina = !report.approvato;
  return <>
    {!(report.ufficio_employee_id && report.stato === "rifiutato") && <CorreggiRapportino rapportinoId={report.id} orderId={orderId} onCorretto={onFatto} />}
    <Button type="button" size="sm" variant="outline" className="text-red-700" disabled={!report.updated_at} onClick={() => setAperto(true)}>
      {elimina ? "Elimina rapportino" : "Annulla rapportino"}
    </Button>
    {aperto && <AnnullaRapportinoDialog elimina={elimina} motivo={motivo} onMotivo={setMotivo} busy={annullaMutation.isPending}
      onClose={() => { if (!annullaMutation.isPending) setAperto(false); }}
      onConferma={() => annullaMutation.mutate({ id: report.id, updatedAt: report.updated_at!, motivo })} />}
  </>;
}
