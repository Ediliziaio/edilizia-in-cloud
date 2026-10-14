import { useEffect, useRef, useState } from "react";
import type { Database } from "@/integrations/supabase/types";
import type { VariationContext } from "@/lib/orders/variationDocumentContext";
import { pendingVariationDocument } from "@/lib/orders/pendingVariationDocument";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDown } from "lucide-react";

type Variation = Database["public"]["Tables"]["ordini_variazione"]["Row"];

/** Download-only: no auth refresh, RPC, uploads, token or database mutation. */
export function PendingVariationPdf({ variation, orderId, companyId, context, onOpenDocuments }: {
  variation: Variation; orderId: string; companyId: string; context: VariationContext; onOpenDocuments?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState<{ url: string; filename: string; snapshot: string } | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const snapshot = JSON.stringify([orderId, companyId, context, variation.id, variation.status,
    variation.numero_odv, variation.titolo, variation.descrizione, variation.motivazione,
    variation.impatto_economico, variation.impatto_giorni, variation.richiesto_da, variation.created_at]);
  const currentSnapshot = useRef(snapshot);
  useEffect(() => { currentSnapshot.current = snapshot; }, [snapshot]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const prepare = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setReady(null);
    try {
      const publicTerms = pendingVariationDocument(variation, orderId, companyId);
      const { variationProposalPdf, variationPdfFilename } = await import("@/lib/orders/variationPreviewPdf");
      const pdf = await variationProposalPdf(publicTerms, { ...context, proposalNumber: variation.numero_odv, proposalRegisteredAt: variation.created_at });
      if (alive.current && currentSnapshot.current === snapshot) {
        setReady({ url: pdf.output("datauristring"), filename: variationPdfFilename(context.orderCode, `OdV-${variation.numero_odv}-${variation.titolo}`), snapshot });
      } else if (alive.current) setError("La proposta o la commessa sono cambiate. Controlla il riepilogo e prepara di nuovo il PDF.");
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "PDF non disponibile. Riprova."); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };

  return <>
    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setOpen(true); setError(""); setReady(null); }}>
      <FileDown className="mr-1 h-3 w-3" /> Proposta PDF
    </Button>
    <Dialog open={open} onOpenChange={value => { if (!lock.current) { setOpen(value); setReady(null); } }}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b p-4 pr-10">
          <DialogTitle>Proposta PDF · OdV #{variation.numero_odv}</DialogTitle>
          <DialogDescription>Scarica e invia come preferisci. Non serve usare il link di firma.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto p-4">
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{variation.titolo}</p>
            <p className="mt-2 whitespace-pre-wrap break-words">{variation.descrizione}</p>
            {variation.motivazione && <p className="mt-2 whitespace-pre-wrap break-words">Motivazione: {variation.motivazione}</p>}
            <p className="mt-3 font-medium">{formatCurrency(variation.impatto_economico)} · IVA esclusa</p>
          </div>
          <div className="text-sm">
            <p>Impresa: {context.companyName || "Da completare"}</p>
            {context.companyDetails && <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{context.companyDetails}</p>}
            <p>Cliente: {context.customerName || "Da completare"}</p>
            {context.customerAddress && <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{context.customerAddress}</p>}
            {context.siteAddress && <p className="break-words">Cantiere: {context.siteAddress}</p>}
            {variation.impatto_giorni > 0 && <p>Giorni aggiuntivi registrati: {variation.impatto_giorni}</p>}
          </div>
          <p className="text-xs text-muted-foreground">Ristampa dai dati registrati e dall'anagrafica attuale, non copia dell'originale inviato. Il PDF è una proposta non firmata: non registra un'approvazione né cambia gli importi.</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {ready?.snapshot === snapshot && <p role="status" className="text-sm">PDF pronto. Scaricalo prima di chiudere.</p>}
          {onOpenDocuments && <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setOpen(false); setReady(null); onOpenDocuments(); }}>Apri Documenti commessa</Button>}
          <p className="text-xs text-muted-foreground">Puoi caricare la copia firmata nei Documenti della commessa. Il solo caricamento non approva la variante.</p>
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t p-4">
          <Button className="min-h-11" variant="outline" disabled={busy} onClick={() => { setOpen(false); setReady(null); }}>Chiudi</Button>
          {ready?.snapshot === snapshot ? <a href={ready.url} download={ready.filename} className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-center text-sm font-medium text-primary-foreground">Scarica proposta PDF</a> :
            <Button className="min-h-11" disabled={busy} onClick={() => void prepare()}>{busy ? "Preparo PDF…" : "Prepara proposta PDF"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
