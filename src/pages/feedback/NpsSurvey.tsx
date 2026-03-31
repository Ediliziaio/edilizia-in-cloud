import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

const SCORE_LABELS: Record<number, string> = {
  0: "Per niente",
  1: "1",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "Assolutamente sì",
};

function getScoreColor(score: number) {
  if (score <= 6) return "bg-red-500 hover:bg-red-600 border-red-500";
  if (score <= 8) return "bg-yellow-500 hover:bg-yellow-600 border-yellow-500";
  return "bg-emerald-500 hover:bg-emerald-600 border-emerald-500";
}

function getScoreColorSelected(score: number) {
  if (score <= 6) return "ring-red-500 bg-red-500 text-white";
  if (score <= 8) return "ring-yellow-500 bg-yellow-500 text-white";
  return "ring-emerald-500 bg-emerald-500 text-white";
}

export default function NpsSurvey() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [tokenError, setTokenError] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      if (score === null || !token) throw new Error("Punteggio mancante");

      // Call the edge function to record the response
      const { data, error } = await supabase.functions.invoke("nps-survey-respond", {
        body: { token, score, feedback_text: feedback.trim() || null },
      });
      if (error) throw error;
      if (data?.error) {
        if (data.error === "token_expired" || data.error === "token_invalid") {
          setTokenError(true);
        }
        throw new Error(data.error);
      }
      return data;
    },
    onSuccess: () => setSubmitted(true),
  });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="max-w-md w-full mx-auto p-8 text-center space-y-3">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-bold">Link non valido</h2>
          <p className="text-muted-foreground">Il link per il sondaggio non è valido o è scaduto.</p>
        </div>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="max-w-md w-full mx-auto p-8 text-center space-y-3">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-bold">Link scaduto</h2>
          <p className="text-muted-foreground">Il link per il sondaggio è scaduto. Contatta il supporto se hai bisogno di assistenza.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="max-w-md w-full mx-auto p-8 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold">Grazie per il tuo feedback!</h2>
          <p className="text-muted-foreground">
            La tua opinione è preziosa e ci aiuta a migliorare Edilizia in Cloud per tutti i nostri utenti.
          </p>
          {score !== null && score >= 9 && (
            <p className="text-sm text-muted-foreground">
              Sei un nostro promotore 🎉 Considera di condividere la tua esperienza con altri!
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="max-w-lg w-full bg-card rounded-2xl shadow-lg p-8 space-y-6">
        {/* Logo placeholder */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-primary font-bold text-xl">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-sm font-bold">E</span>
            </div>
            Edilizia in Cloud
          </div>
        </div>

        <div className="space-y-2 text-center">
          <h1 className="text-xl font-bold">Come valuti Edilizia in Cloud?</h1>
          <p className="text-muted-foreground text-sm">
            Quanto è probabile che tu raccomandi Edilizia in Cloud a un collega o amico?
          </p>
        </div>

        {/* NPS Scale 0-10 */}
        <div className="space-y-3">
          <div className="grid grid-cols-11 gap-1">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                onClick={() => setScore(i)}
                className={cn(
                  "h-10 rounded-md border-2 font-semibold text-sm transition-all",
                  score === i
                    ? `ring-2 ring-offset-1 ${getScoreColorSelected(i)}`
                    : "border-border bg-background hover:border-primary/50 hover:bg-muted"
                )}
              >
                {i}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground px-0.5">
            <span>Per niente probabile</span>
            <span>Assolutamente probabile</span>
          </div>
        </div>

        {/* Score legend */}
        {score !== null && (
          <div className={cn(
            "text-center text-sm font-medium py-2 rounded-lg",
            score <= 6 ? "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400" :
            score <= 8 ? "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/20 dark:text-yellow-400" :
            "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400"
          )}>
            {score <= 6 ? "😕 Detrattore — Ci dispiace, vogliamo migliorare!" :
             score <= 8 ? "😐 Passivo — Grazie, cosa possiamo fare meglio?" :
             "😊 Promotore — Ottimo! Siamo felici che apprezzi il servizio!"}
          </div>
        )}

        {/* Feedback text */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Cosa possiamo migliorare? <span className="text-muted-foreground font-normal">(facoltativo)</span>
          </label>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Dimmi cosa pensi..."
            rows={3}
            className="resize-none"
          />
        </div>

        <Button
          className="w-full"
          size="lg"
          disabled={score === null || submit.isPending}
          onClick={() => submit.mutate()}
        >
          {submit.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Invio in corso...</>
          ) : (
            "Invia feedback"
          )}
        </Button>

        {submit.isError && (
          <p className="text-xs text-destructive text-center">
            Errore: {(submit.error as Error)?.message}
          </p>
        )}

        <p className="text-[11px] text-muted-foreground text-center">
          Il tuo feedback è anonimo e viene usato solo per migliorare il servizio.
        </p>
      </div>
    </div>
  );
}
