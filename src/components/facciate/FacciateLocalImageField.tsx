import { useRef, useState } from "react";
import { TemplateImageFieldView } from "@/components/preventivi/TemplateImageFieldView";
import { readLocalTemplateImage } from "@/lib/moduli-vendita/localTemplateImage";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Deliberately has no bucket, company storage, Supabase client or online branch. */
export function FacciateLocalImageField({ label, value, onChange }: {
  label?: string; value: string | null; onChange: (url: string | null) => void;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <TemplateImageFieldView label={label ?? t("Foto della pagina")} value={value} busy={busy} error={error} localOnly inputRef={input}
      onRemove={() => { setError(""); onChange(null); }}
      onFile={async file => {
        if (!file) return;
        setBusy(true); setError("");
        try { onChange(await readLocalTemplateImage(file)); }
        catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        finally { setBusy(false); if (input.current) input.current.value = ""; }
      }} />;
}
