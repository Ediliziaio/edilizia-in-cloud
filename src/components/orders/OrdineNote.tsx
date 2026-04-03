import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StickyNote } from "lucide-react";

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
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600">
          <StickyNote className="h-4 w-4" />
          Note Interne
        </CardTitle>
        {!isEditing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="text-xs h-7"
          >
            Modifica
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="space-y-3">
            <Textarea
              value={editedNotes}
              onChange={(e) => onNotesChange(e.target.value)}
              rows={4}
              placeholder="Aggiungi note interne..."
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={onSave} disabled={isSaving}>
                {isSaving ? "Salvataggio..." : "Salva"}
              </Button>
              <Button size="sm" variant="outline" onClick={onCancel}>
                Annulla
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {notes || "Nessuna nota interna"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
