import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrderVariations } from "@/hooks/useOrderVariations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RiquadroCommessa, StatoPill, TabellaCommessa, type ColonnaTabella, type TonoStato } from "./TabellaCommessa";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, GitBranch, Loader2, Copy, ExternalLink, Send, SlidersHorizontal } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { EntityCustomFieldsSection } from "@/components/shared/EntityCustomFieldsSection";
import { usePermissions } from "@/hooks/usePermissions";
import { type VariationContext } from "./VariationEditor";
import { variationEventDate } from "@/lib/orders/pendingVariationDocument";
import { PendingVariationPdf } from "./PendingVariationPdf";
import { VariationLifecycleDialog } from "./VariationLifecycleDialog";
import type { WorkflowVariation } from "@/hooks/useVariationWorkflow";

interface OdVSectionProps {
  orderId: string;
  companyId: string;
  context?: VariationContext;
  onOpenDocuments?:()=>void;
}

const STATUS_CONFIG: Record<string, { label: string; tono: TonoStato }> = {
  bozza: { label: "Bozza", tono: "grigio" },
  in_attesa: { label: "In attesa", tono: "ambra" },
  approvato: { label: "Approvato", tono: "verde" },
  rifiutato: { label: "Rifiutato", tono: "rosso" },
  annullato: { label: "Annullato", tono: "grigio" },
};

export function OdVSection({ orderId, companyId, context = {}, onOpenDocuments }: OdVSectionProps) {
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{id:string;existing:boolean}|null>(null);
  const sending = useRef(new Set<string>());
  const [campiDi, setCampiDi] = useState<string | null>(null);
  const [invioEmailLoading, setInvioEmailLoading] = useState<string | null>(null);

  const { data: odvList = [], isLoading, isError, refetch } = useOrderVariations(orderId, companyId);
  // Total approved variazioni
  const totaleApprovato = odvList
    .filter(o => o.status === "approvato")
    .reduce((sum, o) => sum + Number(o.impatto_economico || 0), 0);
  // Riepilogo in testa: da dove si parte, cosa è approvato, cosa aspetta la firma, dove si arriva.
  const inAttesa = odvList.filter(o => o.status === "in_attesa" || o.status === "bozza");
  const totaleInAttesa = inAttesa.reduce((sum, o) => sum + Number(o.impatto_economico || 0), 0);
  const giorniApprovati = odvList.filter(o => o.status === "approvato").reduce((sum, o) => sum + Number(o.impatto_giorni || 0), 0);
  const contrattoAggiornato = typeof context.currentNet === "number" ? context.currentNet : null;
  const contrattoIniziale = contrattoAggiornato != null ? contrattoAggiornato - totaleApprovato : null;

  const copyFirmaLink = async (token: string) => {
    const url = `${window.location.origin}/firma-odv/${token}`;
    try { await navigator.clipboard.writeText(url); toast.success("Link di firma copiato!"); }
    catch { toast.error("Copia non riuscita. Apri il link e copialo dalla barra degli indirizzi."); }
  };
  const approvate = odvList.filter(o => o.status === "approvato");
  const colonne: ColonnaTabella<WorkflowVariation>[] = [
    { titolo: "Variante", principale: true, cella: odv => (
      <div className="min-w-0 max-w-xl">
        <p className="font-medium"><span className="mr-1.5 font-mono text-xs font-normal text-muted-foreground">OdV #{odv.numero_odv}</span>{odv.titolo}</p>
        <p className="line-clamp-1 text-xs font-normal text-muted-foreground max-sm:hidden" title={odv.descrizione}>{odv.descrizione}</p>
        {odv.richiesto_da && <p className="text-xs font-normal text-muted-foreground">Richiesto da: {odv.richiesto_da}</p>}
      </div>
    ) },
    { titolo: "Importo", destra: true, cella: odv => <span className="font-medium">{formatCurrency(odv.impatto_economico)}</span> },
    { titolo: "Giorni", destra: true, cella: odv => (odv.impatto_giorni > 0 ? `+${odv.impatto_giorni}` : "—") },
    { titolo: "Stato", cella: odv => {
      const cfg = STATUS_CONFIG[odv.status] || STATUS_CONFIG.in_attesa;
      const quando = variationEventDate(odv.offline_signed_on ?? odv.firmato_il);
      return <><StatoPill tono={cfg.tono}>{cfg.label}</StatoPill>{quando && <p className="mt-0.5 text-xs text-muted-foreground">{odv.status === "approvato" ? "Approvato" : odv.status === "rifiutato" ? "Rifiutato" : "Elaborato"} {quando}</p>}</>;
    } },
    { titolo: "Azioni", intestazione: <span className="sr-only">Azioni</span>, destra: true, cella: odv => {
      const linkAttivo = odv.status === "in_attesa" && odv.firma_token && !odv.link_revoked_at && (!odv.link_expires_at || new Date(odv.link_expires_at).getTime() > Date.now());
      return (
        <div className="flex flex-wrap items-center justify-end gap-1">
          {permissions.canEditOrders && odv.status === "in_attesa" && !odv.current_document_id && <PendingVariationPdf variation={odv} orderId={orderId} companyId={companyId} context={context} onOpenDocuments={onOpenDocuments} />}
          {permissions.canEditOrders && <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditing({id:odv.id,existing:true})}>{odv.status === "bozza" ? "Riprendi bozza" : "Documento e approvazione"}</Button>}
          {permissions.canEditOrders && linkAttivo && <>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => copyFirmaLink(odv.firma_token as string)}><Copy className="mr-1 h-3 w-3" /> Copia link</Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-blue-600 hover:text-blue-700" disabled={invioEmailLoading === odv.id}
              onClick={async () => {
                if (sending.current.has(odv.id) || !permissions.canEditOrders) return;
                sending.current.add(odv.id);
                setInvioEmailLoading(odv.id);
                try {
                  const { data, error } = await supabase.functions.invoke("invia-odv", { body: { odv_id: odv.id } });
                  if (error || data?.success !== true) throw error || new Error("Invio non confermato");
                  toast.success("Email inviata al cliente");
                  queryClient.invalidateQueries({ queryKey: ["ordini-variazione", orderId] });
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : "Errore nell'invio email");
                } finally {
                  sending.current.delete(odv.id);
                  setInvioEmailLoading(null);
                }
              }}>
              {invioEmailLoading === odv.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
              Invia per email
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => window.open(`/firma-odv/${odv.firma_token}`, "_blank")} aria-label="Apri link firma"><ExternalLink className="h-3 w-3" /></Button>
          </>}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Campi personalizzati di OdV ${odv.numero_odv}`} title="Campi personalizzati" onClick={() => setCampiDi(odv.id)}><SlidersHorizontal className="h-3.5 w-3.5" /></Button>
        </div>
      );
    } },
  ];

  return (
    <>
      <RiquadroCommessa icona={<GitBranch className="h-4 w-4 shrink-0 text-primary" aria-hidden />} titolo="Lavori extra e varianti" conteggio={odvList.length}
        azioni={permissions.canEditOrders ? <Button size="sm" disabled={isLoading || isError} onClick={() => setEditing({id:crypto.randomUUID(),existing:false})} aria-label="Nuova variante">
          <Plus className="h-4 w-4" /><span className="ml-1.5 hidden sm:inline">Nuova variante</span>
        </Button> : undefined}
        numeri={!isLoading && !isError ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Riepilogo varianti">
            <RiepilogoVoce titolo="Contratto iniziale" valore={contrattoIniziale == null ? "—" : formatCurrency(contrattoIniziale)} />
            <RiepilogoVoce titolo={`Varianti approvate (${approvate.length})`}
              valore={`${totaleApprovato > 0 ? "+" : ""}${formatCurrency(totaleApprovato)}`} tono={totaleApprovato < 0 ? "rosso" : totaleApprovato > 0 ? "verde" : undefined}
              nota={giorniApprovati > 0 ? `+${giorniApprovati} giorni di lavoro` : undefined} />
            <RiepilogoVoce titolo={`Da approvare (${inAttesa.length})`} valore={formatCurrency(totaleInAttesa)} tono={inAttesa.length > 0 ? "ambra" : undefined}
              nota={inAttesa.length > 0 ? "non ancora nel contratto" : "niente in sospeso"} />
            <RiepilogoVoce titolo="Contratto aggiornato" valore={contrattoAggiornato == null ? "—" : formatCurrency(contrattoAggiornato)} forte nota="iniziale + approvate, IVA esclusa" />
          </div>
        ) : undefined}>
        {isError ? <div role="alert" className="text-sm text-destructive">Varianti non disponibili. <Button variant="outline" size="sm" onClick={() => refetch()}>Riprova</Button></div> : isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : odvList.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground max-sm:text-xs">
            Nessuna variante registrata.<span className="max-sm:hidden"> Il PDF ha voci, totali, condizioni contrattuali e firme: si stampa da firmare oppure si manda col link di firma online.</span>
          </p>
        ) : (
          <TabellaCommessa etichetta="Varianti della commessa" colonne={colonne} righe={odvList as WorkflowVariation[]} chiave={odv => odv.id} />
        )}
      </RiquadroCommessa>

      <Dialog open={!!campiDi} onOpenChange={aperto => { if (!aperto) setCampiDi(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Campi personalizzati</DialogTitle><DialogDescription>I campi che l'azienda ha aggiunto alle varianti.</DialogDescription></DialogHeader>
          {campiDi && <EntityCustomFieldsSection entityType="ordini_variazione" entityId={campiDi} />}
        </DialogContent>
      </Dialog>
      {editing && <VariationLifecycleDialog key={`${companyId}:${orderId}:${editing.id}`} id={editing.id} existing={editing.existing} order={orderId} company={companyId} context={context} canEdit={permissions.canEditOrders} onClose={() => setEditing(null)} />}
    </>
  );
}

function RiepilogoVoce({ titolo, valore, nota, tono, forte }: { titolo: string; valore: string; nota?: string; tono?: "verde" | "ambra" | "rosso"; forte?: boolean }) {
  const colore = tono === "verde" ? "text-green-700" : tono === "ambra" ? "text-amber-700" : tono === "rosso" ? "text-red-700" : "text-foreground";
  return (
    <div className={`rounded-lg border p-2.5 ${forte ? "border-primary/40 bg-primary/5" : "bg-muted/20"}`}>
      <p className="truncate text-[11px] text-muted-foreground">{titolo}</p>
      <p className={`text-sm font-semibold tabular-nums ${colore}`}>{valore}</p>
      {nota && <p className="text-[10px] text-muted-foreground">{nota}</p>}
    </div>
  );
}
