import { useRef, useState } from "react";
import { TemplateImageFieldView } from "@/components/preventivi/TemplateImageFieldView";
import { readLocalTemplateImage } from "@/lib/moduli-vendita/localTemplateImage";

/** Deliberately has no bucket, company storage, Supabase client or online branch. */
export function FacciateLocalImageField({ label = "Foto della pagina", value, onChange }: {
  label?: string; value: string | null; onChange: (url: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <TemplateImageFieldView label={label} value={value} busy={busy} error={error} localOnly inputRef={input}
      onRemove={() => { setError(""); onChange(null); }}
      onFile={async file => {
        if (!file) return;
        setBusy(true); setError("");
        try { onChange(await readLocalTemplateImage(file)); }
        catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        finally { setBusy(false); if (input.current) input.current.value = ""; }
      }} />;
}
