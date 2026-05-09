/**
 * SilvioRatingButtons — Thumbs up/down sotto le risposte di Silvio Admin.
 *
 * Permette a Florin di valutare la qualità della risposta. Il rating popola
 * ai_test_runs.user_rating per il feedback loop self-improvement.
 *
 * UX: 2 bottoni piccoli, stato persistito via metadata sul messaggio.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function SilvioRatingButtons({ messageId }: { messageId: string }) {
  const queryClient = useQueryClient();
  const [rated, setRated] = useState<1 | 5 | null>(null);

  const rateMutation = useMutation({
    mutationFn: async (rating: 1 | 5) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("silvio_rate_response", {
        p_message_id: messageId,
        p_rating: rating,
      });
      if (error) throw error;
      return data;
    },
    onMutate: (rating) => setRated(rating),
    onSuccess: () => {
      toast.success("Grazie del feedback");
      queryClient.invalidateQueries({ queryKey: ["internal-chat-messages"] });
    },
    onError: (e) => {
      setRated(null);
      toast.error("Errore rating", { description: String(e) });
    },
  });

  const isPending = rateMutation.isPending;

  return (
    <div className="flex items-center gap-1 mt-1.5 opacity-50 hover:opacity-100 transition-opacity">
      <button
        type="button"
        disabled={isPending || rated !== null}
        onClick={() => rateMutation.mutate(5)}
        className={cn(
          "h-6 w-6 rounded inline-flex items-center justify-center transition-colors",
          rated === 5 ? "bg-emerald-100 text-emerald-700" : "hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600",
          isPending && "cursor-wait"
        )}
        title="Risposta utile"
        aria-label="Thumbs up"
      >
        {rated === 5 ? <Check className="h-3 w-3" /> : <ThumbsUp className="h-3 w-3" />}
      </button>
      <button
        type="button"
        disabled={isPending || rated !== null}
        onClick={() => rateMutation.mutate(1)}
        className={cn(
          "h-6 w-6 rounded inline-flex items-center justify-center transition-colors",
          rated === 1 ? "bg-rose-100 text-rose-700" : "hover:bg-rose-50 text-muted-foreground hover:text-rose-600",
          isPending && "cursor-wait"
        )}
        title="Risposta da migliorare"
        aria-label="Thumbs down"
      >
        {rated === 1 ? <Check className="h-3 w-3" /> : <ThumbsDown className="h-3 w-3" />}
      </button>
      {rated && (
        <span className="text-[10px] text-muted-foreground ml-1">
          {rated === 5 ? "👍 utile" : "👎 da migliorare"}
        </span>
      )}
    </div>
  );
}
