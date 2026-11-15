import { useState, KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  // Ogni campo si apre quando serve; se ha già un valore è aperto.
  const [aperti, setAperti] = useState<Set<string>>(new Set());
  const apri = (k: string) => setAperti((p) => (p.has(k) ? p : new Set(p).add(k)));

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

  const causaleAperta = causali.length > 0 || aperti.has("causale");
  const noteDocAperta = !!state.note_documento || aperti.has("note_documento");
  const noteIntAperta = !!state.note_interne || aperti.has("note_interne");
  const chiusi = [
    !causaleAperta && { k: "causale", etichetta: "Causale" },
    !noteDocAperta && { k: "note_documento", etichetta: "Note documento" },
    !noteIntAperta && { k: "note_interne", etichetta: "Note interne" },
  ].filter(Boolean) as { k: string; etichetta: string }[];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">Note e allegati</Label>
        {!disabled && chiusi.map((c) => (
          <Button key={c.k} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => apri(c.k)}>
            <Plus className="mr-1 h-3 w-3" /> {c.etichetta}
          </Button>
        ))}
      </div>

      {/* Causali */}
      {causaleAperta && (
      <div>
        <Label className="text-xs text-muted-foreground">Causali</Label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {causali.map((c, i) => (
            <Badge key={`${c}-${i}`} variant="secondary" className="text-xs gap-1">
              {c}
              {!disabled && (
                <button onClick={() => { apri("causale"); removeCausale(i); }} className="hover:text-destructive" aria-label={`Togli la causale ${c}`}>
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
            autoFocus={aperti.has("causale") && causali.length === 0}
          />
        )}
      </div>
      )}

      {/* Note documento */}
      {noteDocAperta && (
      <div>
        <Label htmlFor="ed-note-documento" className="text-xs text-muted-foreground">Note documento (nel PDF e nell’XML allo SDI)</Label>
        <Textarea
          id="ed-note-documento"
          value={state.note_documento ?? ""}
          onChange={(e) => { apri("note_documento"); setField("note_documento", e.target.value); }}
          rows={3}
          className="text-sm resize-none"
          disabled={disabled}
          autoFocus={aperti.has("note_documento") && !state.note_documento}
        />
      </div>
      )}

      {/* Note interne */}
      {noteIntAperta && (
      <div>
        <Label htmlFor="ed-note-interne" className="text-xs text-muted-foreground">Note interne (non stampate)</Label>
        <Textarea
          id="ed-note-interne"
          value={state.note_interne ?? ""}
          onChange={(e) => { apri("note_interne"); setField("note_interne", e.target.value); }}
          rows={2}
          className="text-sm resize-none"
          disabled={disabled}
          autoFocus={aperti.has("note_interne") && !state.note_interne}
        />
      </div>
      )}
    </div>
  );
}
