import { useState } from "react";
import { Save, StickyNote } from "lucide-react";
import { QuoteCard } from "@/components/marketing/preventivi/ui/builderUI";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function OdaNoteCard({
  notes,
  onSave,
}: {
  notes: string | null;
  onSave: (notes: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Note non salvate. Riprova.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <QuoteCard
      title="Note"
      icon={<StickyNote className="h-4 w-4" />}
      action={
        !editing ? (
          <button
            type="button"
            className="text-xs text-orange-600 font-semibold hover:text-orange-700"
            onClick={() => {
              setDraft(notes || "");
              setError(null);
              setEditing(true);
            }}
          >
            Modifica
          </button>
        ) : (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Annulla
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void save()}>
              <Save className="h-3.5 w-3.5 mr-1" />
              {busy ? "Salvataggio…" : "Salva"}
            </Button>
          </div>
        )
      }
    >
      {editing ? (
        <>
          <Textarea
            aria-label="Note dell’ordine"
            disabled={busy}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-slate-600 whitespace-pre-wrap">
          {notes || "Nessuna nota."}
        </p>
      )}
    </QuoteCard>
  );
}
