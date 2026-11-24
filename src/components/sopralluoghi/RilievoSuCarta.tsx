/**
 * «Rilievo su carta»: le foto e i PDF del foglio, al posto del modulo (piano sopralluoghi, lotto 8).
 * Dall'ufficio si caricano i file; dall'app operai il tecnico assegnato fotografa il foglio e poi
 * consegna (la consegna ora basta con i soli file). Più foto e più PDF per lo stesso rilievo.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteMedia, uploadMedia, type SurveyDetail } from "@/lib/api/surveys";
import { riduciFile } from "@/lib/commesse/riduciFoto";
import { fileCartaValido, tipoMediaCarta } from "@/lib/surveys/suCarta";

export function RilievoSuCarta({ detail, canEdit }: { detail: SurveyDetail; canEdit: boolean }) {
  const qc = useQueryClient();
  const [inCorso, setInCorso] = useState(0);
  const file = detail.media.filter((m) => m.type === "photo" || m.type === "annotated_photo" || m.type === "document");

  const aggiorna = () => qc.invalidateQueries({ queryKey: ["sopralluogo", detail.survey.id] });

  const carica = async (lista: FileList | null) => {
    const scelti = Array.from(lista ?? []);
    if (!scelti.length) return;
    setInCorso(scelti.length);
    let fatti = 0;
    for (const f of scelti) {
      const errore = fileCartaValido(f);
      if (errore) { toast.error(`${f.name}: ${errore}`); setInCorso((n) => n - 1); continue; }
      try {
        const { file: leggero } = await riduciFile(f);
        await uploadMedia(detail.survey.id, leggero, { type: tipoMediaCarta(leggero.type), expectedCompanyId: detail.survey.company_id, position: file.length + fatti });
        fatti++;
      } catch (e) {
        toast.error(`${f.name} non caricato`, { description: e instanceof Error ? e.message : String(e) });
      } finally {
        setInCorso((n) => n - 1);
      }
    }
    if (fatti) toast.success(fatti === 1 ? "File caricato nel rilievo" : `${fatti} file caricati nel rilievo`);
    await aggiorna();
  };

  const togli = async (id: string) => {
    try { await deleteMedia(id); await aggiorna(); } catch (e) { toast.error("File non tolto", { description: e instanceof Error ? e.message : String(e) }); }
  };

  return (
    <section aria-label="Rilievo su carta" className="space-y-3 rounded-2xl border bg-white p-3 sm:p-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4 text-orange-600" />Rilievo su carta</h2>
        <p className="text-xs text-muted-foreground">Niente modulo da compilare: le foto o i PDF del foglio sono il rilievo. Restano nella commessa.</p>
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700">
            <Camera className="h-4 w-4" />Fotografa il foglio
            <input type="file" className="sr-only" accept="image/*" capture="environment" multiple aria-label="Fotografa il foglio"
              disabled={inCorso > 0} onChange={(e) => { void carica(e.target.files); e.target.value = ""; }} />
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 text-sm font-medium hover:bg-muted/40">
            <FileText className="h-4 w-4" />Carica foto o PDF
            <input type="file" className="sr-only" accept="image/*,application/pdf" multiple aria-label="Carica foto o PDF del rilievo"
              disabled={inCorso > 0} onChange={(e) => { void carica(e.target.files); e.target.value = ""; }} />
          </label>
          {inCorso > 0 && <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carico {inCorso}…</span>}
        </div>
      )}
      {file.length === 0
        ? <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Ancora nessun foglio caricato.</p>
        : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Fogli del rilievo">
            {file.map((m) => (
              <li key={m.id} className="group relative overflow-hidden rounded-lg border bg-muted/20">
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="block">
                  {m.type === "document"
                    ? <span className="flex aspect-[3/4] flex-col items-center justify-center gap-1 p-2 text-center text-xs"><FileText className="h-8 w-8 text-rose-600" /><span className="line-clamp-2 break-all">{m.filename ?? "PDF"}</span></span>
                    : <img src={m.url} alt={m.filename ?? "Foto del foglio"} className="aspect-[3/4] w-full object-cover" loading="lazy" />}
                </a>
                {canEdit && (
                  <Button type="button" size="icon" variant="secondary" className="absolute right-1 top-1 h-8 w-8 opacity-90" aria-label={`Togli ${m.filename ?? "file"}`} onClick={() => void togli(m.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
