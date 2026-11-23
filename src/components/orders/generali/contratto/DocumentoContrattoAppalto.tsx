import { Link } from "react-router-dom";
import { FileText, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useChecklistGenerale } from "@/hooks/useGeneraleDocumenti";
import { PannelloVoce } from "../documenti/PannelloVoce";
import { openAttachmentInTab } from "@/components/orders/filePreviewUtils";
import { riconosce, type AllegatoCommessa } from "@/lib/orders/generali/documenti";
import { MAX_MB_PER_FILE } from "@/lib/commesse/documentiCommessa";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";

/** L’originale è nell’archivio Documenti della generale. */
type Props = { riepilogo: RiepilogoGenerale; puoModificare: boolean; apriOriginale?: (file: AllegatoCommessa) => void };

export function DocumentoContrattoAppalto(props: Props) {
  if (props.riepilogo.generale.modello !== "appalto" || !props.riepilogo.permessi.importi) return null;
  return <Documento {...props} />;
}

function Documento({ riepilogo: r, puoModificare, apriOriginale }: Props) {
  const dati = useChecklistGenerale(r);
  if (dati.isLoading) return <Skeleton className="h-28 rounded-lg" />;
  if (dati.isError || !dati.checklist) return <section role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4 text-sm"><p>Non riesco a leggere il documento del contratto.</p><Button variant="outline" size="sm" onClick={dati.refetch}>Riprova</Button></section>;
  const principale = dati.checklist.generale.find(c => c.voce.id === "contratto_firmato");
  if (!principale) return null;
  const applicativi = r.figlie.map(f => ({ commessa: f, file: (dati.allegatiPer.get(f.id) ?? []).filter(a => riconosce(principale.voce, a.file_name)) })).filter(x => x.file.length > 0);
  const apri = (file: AllegatoCommessa) => {
    if (apriOriginale) apriOriginale(file);
    else void openAttachmentInTab(file.file_url).catch(() => toast.error("Non riesco ad aprire il contratto. Riprova."));
  };
  return <section id="contratto-appalto" aria-label="Documento del contratto d’appalto" className="generale-panel scroll-mt-24 overflow-hidden">
    <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
      <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold"><FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />Contratto d’appalto</h2>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${principale.documenti.length ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{principale.documenti.length ? "Originale presente" : "Originale da caricare"}</span>
    </header>
    <div className="space-y-2 px-4 py-3">
      <PannelloVoce casella={principale} generaleId={r.generale.id} allegati={dati.allegatiPer.get(r.generale.id) ?? []}
        puoModificare={puoModificare} nascondiIntestazione apriOriginale={apri} />
      {puoModificare && principale.documenti.length === 0 && <p className="text-xs text-muted-foreground">File fino a {MAX_MB_PER_FILE} MB.</p>}
    </div>
    {applicativi.length > 0 && <div className="space-y-2 border-t bg-muted/20 px-4 py-3">
      <h3 className="text-sm font-medium">Contratti degli applicativi</h3>
      <ul className="divide-y">{applicativi.map(({commessa, file}) => <li key={commessa.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
        <div className="min-w-0 flex-1"><Link className="text-sm font-medium text-primary hover:underline" to={`/azienda/ordini/${commessa.id}?tab=panoramica&section=section-documenti`}>{commessa.codice ?? commessa.nome}</Link><ul className="mt-1 space-y-1">{file.map(a => <li key={a.id}><button type="button" className="inline-flex max-w-full items-start gap-1.5 break-all text-left text-xs hover:underline" onClick={() => apri(a)}><FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{a.file_name}</button></li>)}</ul></div>
        <Link className="inline-flex min-h-9 items-center gap-1 text-xs text-primary hover:underline" to={`/azienda/ordini/${commessa.id}?tab=panoramica&section=section-documenti`}><FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />Apri applicativo</Link>
      </li>)}</ul>
    </div>}
  </section>;
}
