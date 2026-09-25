/**
 * Due scorciatoie per riempire il blocco "Condizioni e termini legali":
 *  - "Parti dal modello standard": clausole tipiche per imprese edili, con i
 *    merge tag già al posto giusto, da adattare.
 *  - "Importa da PDF/Word": l'azienda ha già le sue condizioni in un
 *    documento; l'AI le legge e le riordina nel formato del blocco.
 * Il testo risultante va SEMPRE riletto: la barra lo propone, non lo salva.
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2, Sparkles, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CONDIZIONI_STANDARD_MD } from "@/lib/condizioniStandard";
import { estraiTestoDocx } from "@/lib/docxText";

const BUCKET_IMPORT = "quote-template-assets";
const MAX_MB = 15;

interface Props {
  companyId: string | null | undefined;
  testoAttuale: string;
  onTesto: (markdown: string) => void;
  /** Layout stretto (card dentro i moduli) */
  compatto?: boolean;
  /** Il modulo ha già il suo "modello standard": mostra solo l'import da documento. */
  soloImport?: boolean;
  /** Local drafts never upload a document or invoke an online AI function. */
  localOnly?: boolean;
}

export function ImportaCondizioniBar({ companyId, testoAttuale, onTesto, compatto = false, soloImport = false, localOnly = false }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const conferma = (msg: string) => !testoAttuale.trim() || window.confirm(msg);

  const usaModello = () => {
    if (!conferma("Sostituire il testo attuale con il modello standard?")) return;
    onTesto(CONDIZIONI_STANDARD_MD);
    toast.success("Modello standard inserito", { description: "Rileggilo e adattalo: non è consulenza legale." });
  };

  const importa = async (file: File) => {
    if (!companyId) { toast.error("Azienda non disponibile"); return; }
    if (file.size > MAX_MB * 1024 * 1024) { toast.error(`File troppo grande (max ${MAX_MB} MB)`); return; }
    if (!conferma("Il testo importato sostituirà quello attuale. Continuare?")) return;
    setBusy(true);
    try {
      const nome = file.name.toLowerCase();
      if (localOnly) {
        const content = nome.endsWith(".docx") ? await estraiTestoDocx(file)
          : /\.(txt|md)$/.test(nome) ? await file.text() : null;
        if (content === null) throw new Error("In locale puoi importare Word (.docx) o testo (.txt/.md). Nessun file viene caricato online.");
        if (!content.trim()) throw new Error("Il documento non contiene testo leggibile.");
        onTesto(content.trim());
        toast.success("Testo importato in locale", { description: "Verifica struttura e contenuto prima di salvarlo." });
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let body: Record<string, any>;
      if (nome.endsWith(".docx")) {
        body = { company_id: companyId, text: await estraiTestoDocx(file), file_name: file.name };
      } else if (nome.endsWith(".txt") || nome.endsWith(".md")) {
        body = { company_id: companyId, text: await file.text(), file_name: file.name };
      } else if (nome.endsWith(".pdf") || file.type.startsWith("image/")) {
        const ext = nome.endsWith(".pdf") ? "pdf" : (file.type.split("/")[1] || "jpg");
        const path = `${companyId}/import-condizioni-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET_IMPORT).upload(path, file, { upsert: true });
        if (upErr) throw new Error(`Caricamento non riuscito: ${upErr.message}`);
        body = { company_id: companyId, storage_bucket: BUCKET_IMPORT, storage_path: path, file_name: file.name, mime_type: file.type || (ext === "pdf" ? "application/pdf" : `image/${ext}`) };
      } else {
        throw new Error("Formati accettati: PDF, Word (.docx), testo (.txt/.md) o immagine");
      }
      const { data, error } = await supabase.functions.invoke("ai-importa-condizioni", { body });
      if (error) {
        let dettaglio: string | null = null;
        try { const ctx = (error as { context?: unknown }).context; if (ctx instanceof Response) dettaglio = ((await ctx.json()) as { error?: string }).error ?? null; } catch { /* niente */ }
        throw new Error(dettaglio ?? error.message ?? "Importazione non riuscita");
      }
      if (data?.error) throw new Error(String(data.error));
      const markdown = String(data?.markdown ?? "").trim();
      if (!markdown) throw new Error("Nessun testo ricavato dal documento");
      onTesto(markdown);
      const note: string[] = Array.isArray(data?.note) ? data.note : [];
      const mancanze: string[] = Array.isArray(data?.mancanze) ? data.mancanze : [];
      toast.success("Condizioni importate: rileggile prima di salvare", {
        duration: 9000,
        description: [note.length ? `Note: ${note.slice(0, 3).join("; ")}` : "", mancanze.length ? `Mancano nel documento: ${mancanze.slice(0, 4).join(", ")}` : ""].filter(Boolean).join(" · ") || undefined,
      });
    } catch (e) {
      toast.error("Importazione non riuscita", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-orange-300 bg-orange-50/50 px-3 py-2 ${compatto ? "text-xs" : "text-sm"}`}>
      <Sparkles className="h-4 w-4 shrink-0 text-orange-600" />
      <span className="text-muted-foreground">Non partire da zero:</span>
      {!soloImport && (
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={usaModello} disabled={busy}>
          <WandSparkles className="h-3.5 w-3.5" /> Parti dal modello standard
        </Button>
      )}
      <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
        {busy ? (localOnly ? "Lettura del documento…" : "L'AI sta leggendo il documento…") : (localOnly ? "Importa Word / testo in locale" : "Importa da PDF / Word (AI)")}
      </Button>
      <input ref={fileRef} type="file" accept={localOnly ? ".docx,.txt,.md" : ".pdf,.docx,.txt,.md,image/*"} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importa(f); }} />
    </div>
  );
}
