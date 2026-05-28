/**
 * AiDraftButton — MP-EMAIL-AI-01 · L4 trigger
 *
 * Pulsante "Rispondi con AI" che chiama l'edge function L4 (Sonnet bozza)
 * e passa il risultato al callback `onDraftReady` (che apre il compose
 * dialog con i campi pre-compilati).
 *
 * UX:
 *   - Loading spinner durante la chiamata
 *   - Toast on error
 *   - Mai auto-send: la bozza è EDITABILE, l'utente preme manualmente "Invia"
 */

import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { useGenerateAiDraft, type DraftResponse } from "@/lib/email-ai/hooks";
import { cn } from "@/lib/utils";

export interface AiDraftButtonProps {
  email_id: string;
  /** Callback chiamato quando la bozza è pronta (apri compose con valori pre-popolati). */
  onDraftReady: (draft: DraftResponse) => void;
  /** Variante visuale */
  variant?: "default" | "secondary" | "outline" | "ghost";
  /** Size button */
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  /** Compatto: solo icona */
  iconOnly?: boolean;
  /** Disabilita il bottone */
  disabled?: boolean;
}

export function AiDraftButton({
  email_id,
  onDraftReady,
  variant = "default",
  size = "sm",
  className,
  iconOnly = false,
  disabled = false,
}: AiDraftButtonProps) {
  const generateDraft = useGenerateAiDraft();

  const handleClick = async () => {
    try {
      const draft = await generateDraft.mutateAsync(email_id);
      onDraftReady(draft);
    } catch {
      // toast già gestito dal hook
    }
  };

  const isLoading = generateDraft.isPending;

  return (
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
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
      {!iconOnly && (
        <span>{isLoading ? "Genero..." : "Rispondi con AI"}</span>
      )}
    </Button>
  );
}
