/**
 * AiDraftButton — MP-EMAIL-AI-02 · L4 trigger + selettore varianti
 *
 * Flusso:
 *   1. Click → chiama email-ai-l4-draft (Sonnet)
 *   2. Se categoria no-reply (newsletter/social/notifica/spam) → toast "nessuna risposta necessaria"
 *   3. Altrimenti apre un dialog con:
 *      - banner "dati da completare" (dati_mancanti) se presenti
 *      - le varianti (Secca / Diplomatica) come card selezionabili
 *      - i placeholder [DA VERIFICARE: ...] evidenziati
 *   4. Click "Usa questa bozza" → onDraftChosen(oggetto, corpo) → apre compose pre-popolato
 *
 * MAI invio automatico: la bozza finisce nel compose editabile, l'utente preme Invia.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Sparkles, Loader2, AlertTriangle, ArrowRight } from "lucide-react";
import { useGenerateAiDraft, type DraftResponse, type DraftVariante } from "@/lib/email-ai/hooks";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface AiDraftButtonProps {
  email_id: string;
  /** Callback con la variante scelta dall'utente → apre il compose pre-popolato. */
  onDraftChosen: (oggetto: string, corpo: string) => void;
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  iconOnly?: boolean;
  disabled?: boolean;
}

/** Evidenzia i placeholder [DA VERIFICARE: ...] nel corpo bozza. */
function highlightPlaceholders(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\[DA VERIFICARE:[^\]]*\]/gi;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    parts.push(
      <mark key={`ph-${key++}`} className="bg-amber-200 text-amber-900 rounded px-1 font-medium">
        {m[0]}
      </mark>,
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

export function AiDraftButton({
  email_id,
  onDraftChosen,
  variant = "default",
  size = "sm",
  className,
  iconOnly = false,
  disabled = false,
}: AiDraftButtonProps) {
  const generateDraft = useGenerateAiDraft();
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [open, setOpen] = useState(false);

  const handleClick = async () => {
    try {
      const result = await generateDraft.mutateAsync(email_id);
      if (result.no_reply) {
        toast.info("Nessuna risposta necessaria", {
          description: `Le email di tipo "${result.categoria}" non richiedono una bozza.`,
        });
        return;
      }
      if (!result.varianti || result.varianti.length === 0) {
        toast.error("Bozza non disponibile", { description: "Il modello non ha prodotto varianti utilizzabili." });
        return;
      }
      setDraft(result);
      setOpen(true);
    } catch {
      // toast gestito dal hook
    }
  };

  const handleChoose = (v: DraftVariante) => {
    if (!draft) return;
    onDraftChosen(draft.oggetto || "", v.corpo);
    setOpen(false);
    setDraft(null);
  };

  const isLoading = generateDraft.isPending;

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={isLoading || disabled}
        variant={variant}
        size={size}
        className={cn(
          "gap-1.5",
          variant === "default" && "bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 text-white",
          className,
        )}
        aria-label={isLoading ? "Generazione bozza in corso" : "Genera bozza con AI"}
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {!iconOnly && <span>{isLoading ? "Genero..." : "Rispondi con AI"}</span>}
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setDraft(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" />
              Scegli la bozza di risposta
            </DialogTitle>
            <DialogDescription>
              Bozze generate dall'AI. Scegline una, poi potrai modificarla prima di inviare.
              {draft?.playbook_used && (
                <span className="ml-1 text-xs opacity-70">(playbook: {draft.playbook_used})</span>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Banner dati mancanti */}
          {draft && draft.dati_mancanti.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-2 text-amber-800 font-medium text-sm mb-1.5">
                <AlertTriangle className="h-4 w-4" />
                Dati da completare prima di inviare
              </div>
              <ul className="list-disc list-inside text-xs text-amber-700 space-y-0.5">
                {draft.dati_mancanti.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
              <p className="text-[11px] text-amber-600 mt-1.5">
                I segnaposto <mark className="bg-amber-200 px-1 rounded">[DA VERIFICARE: ...]</mark> nel testo vanno sostituiti con i dati reali.
              </p>
            </div>
          )}

          {/* Oggetto */}
          {draft?.oggetto && (
            <div className="text-sm">
              <span className="text-muted-foreground">Oggetto: </span>
              <span className="font-medium">{draft.oggetto}</span>
            </div>
          )}

          {/* Varianti */}
          <div className="space-y-3">
            {draft?.varianti.map((v, i) => (
              <div
                key={i}
                className="rounded-lg border border-border hover:border-violet-300 transition-colors p-3 group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                    {v.etichetta}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                    onClick={() => handleChoose(v)}
                  >
                    Usa questa <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
                  {highlightPlaceholders(v.corpo)}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); setDraft(null); }}>
              Annulla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
