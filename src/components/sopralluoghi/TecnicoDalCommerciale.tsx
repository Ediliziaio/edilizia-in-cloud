/**
 * Dal sopralluogo commerciale al rilievo tecnico, e ritorno (piano sopralluoghi, lotto 2).
 * - commerciale senza tecnico: «Crea il rilievo tecnico» (copia ambienti ed elementi);
 * - commerciale con tecnico: «Apri il rilievo tecnico»;
 * - tecnico nato da un commerciale: «Apri il commerciale».
 */
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { tecnicoDaCommerciale } from "@/lib/api/surveys";
import type { SurveyRow } from "@/types/surveys";

export function TecnicoDalCommerciale({ survey, disabled }: { survey: SurveyRow & { origine_id?: string | null }; disabled?: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canViewSopralluoghi, solaLettura } = usePermissions();
  const commerciale = survey.tipo === "commerciale";
  const tecnico = useQuery({
    queryKey: ["tecnico-da-commerciale", survey.id],
    enabled: commerciale && canViewSopralluoghi,
    queryFn: async () => {
      const { data, error } = await supabase.from("surveys").select("id, code")
        .eq("origine_id" as never, survey.id as never).is("deleted_at", null).limit(1).maybeSingle();
      if (error) throw error;
      return (data as { id: string; code: string | null } | null) ?? null;
    },
  });
  const crea = useMutation({
    mutationFn: () => tecnicoDaCommerciale(survey.id),
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: ["sopralluoghi-bacheca"] });
      void queryClient.invalidateQueries({ queryKey: ["tecnico-da-commerciale", survey.id] });
      toast.success("Rilievo tecnico creato", { description: "Ambienti ed elementi sono già lì: il tecnico scrive le misure precise." });
      navigate(`/azienda/sopralluoghi/${id}`);
    },
    onError: (e: Error) => toast.error("Rilievo tecnico non creato", { description: e.message }),
  });
  if (!canViewSopralluoghi) return null;
  if (!commerciale) {
    if (!survey.origine_id) return null;
    return (
      <Button variant="ghost" className="min-h-10 gap-2 rounded-xl" onClick={() => navigate(`/azienda/sopralluoghi/${survey.origine_id}`)}>
        <ArrowRightLeft className="h-4 w-4" />Apri il commerciale
      </Button>
    );
  }
  if (tecnico.data) {
    return (
      <Button variant="outline" className="min-h-10 gap-2 rounded-xl" onClick={() => navigate(`/azienda/sopralluoghi/${tecnico.data!.id}`)}>
        <ArrowRightLeft className="h-4 w-4" />Apri il rilievo tecnico {tecnico.data.code ?? ""}
      </Button>
    );
  }
  if (solaLettura) return null;
  return (
    <Button variant="outline" className="min-h-10 gap-2 rounded-xl" disabled={disabled || crea.isPending || tecnico.isLoading} onClick={() => crea.mutate()}>
      {crea.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}Crea il rilievo tecnico
    </Button>
  );
}
