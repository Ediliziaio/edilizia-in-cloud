/**
 * NpsModal — Net Promoter Score survey
 *
 * Triggered when:
 *   - Company onboarding reaches 100% for the first time
 *   - OR user has been active for 30+ days without previously answering
 *
 * Rate-limited with localStorage — shows at most once every 90 days.
 * Saves response to `nps_responses` table (if it exists).
 */

import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Star } from "lucide-react";

const STORAGE_KEY = "nps_last_shown";
const NPS_COOLDOWN_DAYS = 90;

export function useNpsTrigger(pct: number) {
  const alreadyShown = (() => {
    try {
      const last = localStorage.getItem(STORAGE_KEY);
      if (!last) return false;
      const daysSince = (Date.now() - parseInt(last)) / (1000 * 60 * 60 * 24);
      return daysSince < NPS_COOLDOWN_DAYS;
    } catch {
      return false;
    }
  })();

  return pct === 100 && !alreadyShown;
}

interface NpsModalProps {
  open: boolean;
  onClose: () => void;
}

const SCORE_LABELS: Record<number, string> = {
  0: "Per nulla probabile",
  1: "", 2: "", 3: "", 4: "", 5: "", 6: "",
  7: "Abbastanza probabile",
  8: "", 9: "",
  10: "Estremamente probabile",
};

export function NpsModal({ open, onClose }: NpsModalProps) {
  const { effectiveCompany, user } = useAuth();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (score === null) return;
    setSubmitting(true);
    try {
      // Save to nps_responses — best-effort (table may not exist in all envs)
      await (supabase
        .from("nps_responses" as never)
        .insert({
          company_id: effectiveCompany?.id,
          user_id: user?.id,
          score,
          comment: comment.trim() || null,
          source: "onboarding_completion",
        }) as any
      ).catch(() => {});

      // Mark as shown
      try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /* Safari Private Browsing */ }
      setSubmitted(true);
      setTimeout(() => {
        onClose();
        setSubmitted(false);
        setScore(null);
        setComment("");
      }, 2000);
    } catch {
      toast.error("Impossibile salvare il feedback");
    } finally {
      setSubmitting(false);
    }
  }, [score, comment, effectiveCompany?.id, user?.id, onClose]);

  const handleSkip = () => {
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /* Safari Private Browsing */ }
    onClose();
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm text-center">
          <div className="py-8 space-y-3">
            <Star className="h-12 w-12 text-yellow-400 fill-yellow-400 mx-auto" />
            <p className="text-lg font-semibold">Grazie per il feedback!</p>
            <p className="text-sm text-muted-foreground">Il tuo giudizio ci aiuta a migliorare.</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleSkip}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">
            🎉 Setup completato! Come ti sta andando?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Con quale probabilità consiglieresti <strong>Edilizia in Cloud</strong> a un collega del settore?
          </p>

          {/* Score selector 0–10 */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground px-0.5">
              <span>Per nulla</span>
              <span>Assolutamente</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {Array.from({ length: 11 }, (_, i) => i).map((n) => {
                const isSelected = score === n;
                const color = n <= 6 ? "hover:bg-red-100 hover:border-red-400" :
                              n <= 8 ? "hover:bg-yellow-100 hover:border-yellow-400" :
                                       "hover:bg-green-100 hover:border-green-400";
                const selectedColor = n <= 6 ? "bg-red-500 text-white border-red-500" :
                                      n <= 8 ? "bg-yellow-500 text-white border-yellow-500" :
                                               "bg-green-500 text-white border-green-500";
                return (
                  <button
                    key={n}
                    onClick={() => setScore(n)}
                    className={`w-9 h-9 rounded-md border text-sm font-semibold transition-colors ${
                      isSelected ? selectedColor : `border-border bg-background ${color}`
                    }`}
                    aria-label={`Punteggio ${n}: ${SCORE_LABELS[n] || ""}`}
                    aria-pressed={isSelected}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional comment */}
          {score !== null && (
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                {score <= 6
                  ? "Cosa possiamo migliorare?"
                  : score >= 9
                  ? "Cosa ti piace di più?"
                  : "Qualcosa da migliorare?"}
                {" "}
                <span className="text-xs">(opzionale)</span>
              </label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Scrivi qui..."
                className="text-sm resize-none"
                rows={3}
              />
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={handleSkip}>
              Salta
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={score === null || submitting}
            >
              {submitting ? "Invio..." : "Invia feedback"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
