import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useFieldSurveyAccess } from "@/hooks/useFieldSurveys";
import { SurveyAccessContext } from "@/contexts/SurveyAccessContext";
import SopralluogoEditor from "@/pages/azienda/sopralluoghi/SopralluogoEditor";
import { Button } from "@/components/ui/button";
export default function CampoSopralluogo() {
  const { id } = useParams<{ id: string }>();
  const access = useFieldSurveyAccess(id || null);
  const qc = useQueryClient();
  // Drop cached technical data when authorization is revoked, never render stale details.
  useEffect(() => {
    if ((access.data?.can_view === false || access.isError) && id)
      qc.removeQueries({ queryKey: ["sopralluogo", id] });
  }, [access.data?.can_view, access.isError, id, qc]);
  if (!id || access.isError)
    return (
      <div role="alert" className="p-5">
        Impossibile verificare l’accesso.{" "}
        <Button onClick={() => void access.refetch()}>Riprova</Button>
      </div>
    );
  if (access.isPending)
    return (
      <p role="status" className="p-5">
        Verifico l’assegnazione…
      </p>
    );
  if (!access.data?.can_view)
    return (
      <p role="alert" className="rounded-2xl border p-5">
        Sopralluogo non disponibile: serve un’assegnazione autorizzata
        dall’ufficio.
      </p>
    );
  return (
    <SurveyAccessContext.Provider
      value={{ field: true, canEdit: access.data.can_edit }}
    >
      <SopralluogoEditor />
    </SurveyAccessContext.Provider>
  );
}
