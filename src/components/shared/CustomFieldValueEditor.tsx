import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CustomFieldInput } from "./CustomFieldInput";
import { serializeFieldValue, validateFieldValue } from "@/lib/custom-fields/values";

/** Commit is explicit and awaited: no premature success icon or discarded failed draft. */
export function CustomFieldValueEditor({ fieldId, label, type, options, value, disabled = false, onSave }: {
  fieldId: string; label: string; type: string; options?: string[] | null; value: unknown;
  disabled?: boolean; onSave: (value: string) => Promise<unknown>;
}) {
  const storedValue = serializeFieldValue(value);
  const [editing, setEditing] = useState<{ draft: unknown; observed: string; confirmed: string | null }>(() => ({ draft: value ?? "", observed: storedValue, confirmed: null }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // Adjust only when the external value changes. Preserve unsaved edits without
  // an effect/setState render cascade; successful writes are acknowledged locally.
  if (editing.observed !== storedValue) {
    const clean = serializeFieldValue(editing.draft) === (editing.confirmed ?? editing.observed);
    setEditing({ draft: clean ? value ?? "" : editing.draft, observed: storedValue, confirmed: null });
    if (saved) setSaved(false);
  }
  const draft = editing.draft;
  const dirty = serializeFieldValue(draft) !== (editing.confirmed ?? storedValue);
  const save = async () => {
    if (disabled || lock.current || !dirty || type === "file") return;
    const problem = validateFieldValue(type, draft);
    if (problem) { setError(problem); return; }
    lock.current = true; setPending(true); setError(null); setSaved(false);
    const submitted = serializeFieldValue(draft);
    try { await onSave(submitted); if (alive.current) { setEditing(prev => ({ ...prev, confirmed: submitted })); setSaved(true); } }
    catch { if (alive.current) setError("Il campo non è stato salvato. La modifica resta qui: riprova."); }
    finally { lock.current = false; if (alive.current) setPending(false); }
  };
  return <div className="space-y-2 rounded-lg border p-3">
    <CustomFieldInput fieldId={fieldId} label={label} type={type} options={options} value={draft} disabled={disabled || pending} onChange={v => { setEditing(prev => ({ ...prev, draft: v })); setSaved(false); setError(null); }} />
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {!disabled && type !== "file" && dirty && <div className="flex gap-2"><Button size="sm" onClick={() => void save()} disabled={pending}>{pending ? "Salvataggio…" : "Salva campo"}</Button><Button variant="ghost" size="sm" disabled={pending} onClick={() => { setEditing(prev => ({ ...prev, draft: prev.confirmed ?? value ?? "" })); setError(null); setSaved(false); }}>Annulla modifica</Button></div>}
    {saved && <p role="status" className="text-xs text-blue-700">Campo salvato</p>}
  </div>;
}
