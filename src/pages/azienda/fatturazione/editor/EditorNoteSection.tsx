import { useState, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

export function EditorNoteSection({ state, dispatch, disabled }: Props) {
  const [causaleInput, setCausaleInput] = useState("");

  function setField(field: string, value: unknown) {
    dispatch({ type: "SET_FIELD", field, value });
  }

  const causali = (state.causale as string[] | undefined) ?? [];

  function addCausale() {
    const trimmed = causaleInput.trim();
    if (!trimmed) return;
    setField("causale", [...causali, trimmed]);
    setCausaleInput("");
  }

  function removeCausale(index: number) {
    setField("causale", causali.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addCausale();
    }
  }

  return (
    <div className="space-y-4 rounded-lg border p-4 bg-card shadow-sm">
      <Label className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">Note e riferimenti</Label>

      {/* Causali */}
      <div>
        <Label className="text-xs text-muted-foreground">Causali</Label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {causali.map((c, i) => (
            <Badge key={`${c}-${i}`} variant="secondary" className="text-xs gap-1">
              {c}
              {!disabled && (
                <button onClick={() => removeCausale(i)} className="hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </Badge>
          ))}
        </div>
        {!disabled && (
          <Input
            placeholder="Scrivi una causale e premi Invio..."
            value={causaleInput}
            onChange={(e) => setCausaleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 text-sm"
          />
        )}
      </div>

      {/* Note documento */}
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

      {/* Note interne */}
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
