/**
 * FirmaCliente — pagina dedicata firma full-screen
 */
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getSurvey } from "@/lib/api/surveys";
import { SignaturePad } from "@/components/surveys/engine/SignaturePad";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export default function FirmaCliente() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: detail, isLoading, isError, refetch } = useQuery({
    queryKey: ["sopralluogo", id],
    enabled: !!id,
    queryFn: () => getSurvey(id!),
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Errore di caricamento o sopralluogo inesistente: niente skeleton infinito,
  // mostriamo un errore esplicito con vie d'uscita (firma = pagina a valore legale).
  if (isError || !detail || !id) {
    return (
      <div className="p-4">
        <div className="mx-auto max-w-md rounded-xl border border-red-200 dark:border-red-900/40 bg-card p-6 sm:p-10 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-500/70" />
          <p className="font-semibold mb-1">
            {isError ? t("Impossibile caricare la firma") : t("Sopralluogo non trovato")}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            {isError
              ? t("Si è verificato un errore. Controlla la connessione e riprova.")
              : t("Il sopralluogo potrebbe essere stato eliminato o il link non è più valido.")}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/azienda/sopralluoghi")}>
              {t("Torna alla lista")}
            </Button>
            {isError && (
              <Button size="sm" className="bg-orange-600 hover:bg-orange-700" onClick={() => refetch()}>
                {t("Riprova")}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (detail.survey.client_signature_at || detail.survey.status === "signed") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-6 text-center">
        <h1 className="text-lg font-semibold">{t("Sopralluogo già firmato")}</h1>
        <p className="text-sm text-muted-foreground">{t("Questo rilievo ha già una firma registrata. Apri il dettaglio per consultarla.")}</p>
        <Button variant="outline" onClick={() => navigate(`/azienda/sopralluoghi/${id}`)}>{t("Torna al sopralluogo")}</Button>
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
