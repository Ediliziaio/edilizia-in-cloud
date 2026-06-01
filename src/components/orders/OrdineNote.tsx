import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StickyNote, Loader2 } from "lucide-react";
import {
  QuoteCard,
  QuotePrimaryButton,
} from "@/components/marketing/preventivi/ui/builderUI";

interface OrdineNoteProps {
  notes: string | null;
  isEditing: boolean;
  editedNotes: string;
  isSaving: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onNotesChange: (value: string) => void;
}

export function OrdineNote({
  notes,
  isEditing,
  editedNotes,
  isSaving,
  onEdit,
  onSave,
  onCancel,
  onNotesChange,
}: OrdineNoteProps) {
  return (
    <QuoteCard
      title="Note Interne"
      icon={<StickyNote className="h-4 w-4" />}
      action={
        !isEditing ? (
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-semibold text-orange-600 hover:text-orange-700 hover:underline"
          >
            Modifica
          </button>
        ) : null
      }
    >
      {isEditing ? (
        <div className="space-y-3">
          <Textarea
            value={editedNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={4}
            placeholder="Aggiungi note interne..."
            className="text-sm border-slate-200 focus-visible:ring-orange-500"
          />
          <div className="flex gap-2">
            <QuotePrimaryButton size="sm" onClick={onSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                "Salva"
              )}
            </QuotePrimaryButton>
            <Button
              size="sm"
              variant="outline"
              onClick={onCancel}
              className="text-xs"
            >
              Annulla
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600 whitespace-pre-wrap">
          {notes || (
            <span className="text-muted-foreground italic">Nessuna nota interna</span>
          )}
        </p>
      )}
    </QuoteCard>
  );
}
