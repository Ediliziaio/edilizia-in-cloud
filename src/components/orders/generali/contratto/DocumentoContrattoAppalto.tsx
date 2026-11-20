import { Link } from "react-router-dom";
import { FileText, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useChecklistGenerale } from "@/hooks/useGeneraleDocumenti";
import { PannelloVoce } from "../documenti/PannelloVoce";
import { openAttachmentInTab } from "@/components/orders/filePreviewUtils";
import { riconosce } from "@/lib/orders/generali/documenti";
import { MAX_MB_PER_FILE } from "@/lib/commesse/documentiCommessa";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";

/** Stesso originale in Panoramica, Contratto e Documenti. I file degli applicativi
 * restano sulle rispettive commesse e non soddisfano il contratto della madre. */
export function DocumentoContrattoAppalto({ riepilogo, puoModificare }: { riepilogo: RiepilogoGenerale; puoModificare: boolean }) {
  if (riepilogo.generale.modello !== "appalto" || !riepilogo.permessi.importi) return null;
  return <Documento riepilogo={riepilogo} puoModificare={puoModificare} />;
}

function Documento({ riepilogo: r, puoModificare }: { riepilogo: RiepilogoGenerale; puoModificare: boolean }) {
  const dati = useChecklistGenerale(r);
  if (dati.isLoading) return <Skeleton className="h-28 rounded-lg" />;
  if (dati.isError || !dati.checklist) return <section role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4 text-sm"><p>Non riesco a leggere il documento del contratto.</p><Button variant="outline" size="sm" onClick={dati.refetch}>Riprova</Button></section>;
  const principale = dati.checklist.generale.find(c => c.voce.id === "contratto_firmato");
  if (!principale) return null;
  const applicativi = r.figlie.map(f => ({ commessa: f, file: (dati.allegatiPer.get(f.id) ?? []).filter(a => riconosce(principale.voce, a.file_name)) })).filter(x => x.file.length > 0);
  return <section aria-label="Documento del contratto d’appalto" className="generale-panel overflow-hidden">
    <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
      <div className="min-w-0"><h2 className="flex items-center gap-2 text-base font-semibold"><FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />Contratto d’appalto della commessa principale</h2><p className="mt-1 text-xs text-muted-foreground">Un unico originale della commessa generale, consultabile anche dagli applicativi.</p></div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${principale.documenti.length ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{principale.documenti.length ? "Originale presente" : "Originale da caricare"}</span>
    </header>
    <div className="space-y-2 px-4 py-3">
      <PannelloVoce casella={principale} generaleId={r.generale.id} allegati={dati.allegatiPer.get(r.generale.id) ?? []} puoModificare={puoModificare} nascondiIntestazione />
      {principale.documenti.length === 0 && <p className="text-sm text-muted-foreground">I dati contrattuali e l’allegato sono distinti: puoi conservare il documento completo anche prima di compilare gli importi.</p>}
      {puoModificare && <p className="text-xs text-muted-foreground">PDF e altri formati dell’archivio, fino a {MAX_MB_PER_FILE} MB. Conservato integralmente, senza passare dal lettore AI.</p>}
    </div>
    {applicativi.length > 0 && <div className="space-y-2 border-t bg-muted/20 px-4 py-3">
      <h3 className="text-sm font-medium">Contratti degli applicativi</h3>
      <p className="text-xs text-muted-foreground">Questi documenti appartengono ai singoli lavori e non sostituiscono il contratto della commessa principale.</p>
      <ul className="divide-y">{applicativi.map(({commessa, file}) => <li key={commessa.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
        <div className="min-w-0 flex-1"><Link className="text-sm font-medium text-primary hover:underline" to={`/azienda/ordini/${commessa.id}?tab=panoramica&section=section-documenti`}>{commessa.codice ?? commessa.nome}</Link><ul className="mt-1 space-y-1">{file.map(a => <li key={a.id}><button type="button" className="inline-flex max-w-full items-start gap-1.5 break-all text-left text-xs hover:underline" onClick={() => void openAttachmentInTab(a.file_url).catch(() => toast.error("Non riesco ad aprire il contratto. Riprova."))}><FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{a.file_name}</button></li>)}</ul></div>
        <Link className="inline-flex min-h-9 items-center gap-1 text-xs text-primary hover:underline" to={`/azienda/ordini/${commessa.id}?tab=panoramica&section=section-documenti`}><FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />Apri applicativo</Link>
      </li>)}</ul>
    </div>}
  </section>;
}
