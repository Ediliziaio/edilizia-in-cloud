import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

export function EditorNoteSection({ state, dispatch, disabled }: Props) {
  function setField(field: string, value: string) {
    dispatch({ type: "SET_FIELD", field, value });
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-semibold">Note</Label>

      <div>
        <Label className="text-xs text-muted-foreground">Note documento (visibili in fattura)</Label>
        <Textarea
          value={state.note_documento ?? ""}
          onChange={(e) => setField("note_documento", e.target.value)}
          rows={3}
          className="text-sm resize-none"
          disabled={disabled}
        />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Note interne (non stampate)</Label>
        <Textarea
          value={state.note_interne ?? ""}
          onChange={(e) => setField("note_interne", e.target.value)}
          rows={2}
          className="text-sm resize-none"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
