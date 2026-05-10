/**
 * FirmaCliente — pagina dedicata firma full-screen
 */
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getSurvey } from "@/lib/api/surveys";
import { SignaturePad } from "@/components/surveys/engine/SignaturePad";
import { Skeleton } from "@/components/ui/skeleton";

export default function FirmaCliente() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: detail } = useQuery({
    queryKey: ["sopralluogo", id],
    enabled: !!id,
    queryFn: () => getSurvey(id!),
  });

  if (!detail || !id) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <SignaturePad
      surveyId={id}
      onConfirm={() => navigate(`/azienda/sopralluoghi/${id}`)}
      onCancel={() => navigate(`/azienda/sopralluoghi/${id}`)}
    />
  );
}
