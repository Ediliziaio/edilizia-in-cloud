import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrderVariations } from "@/hooks/useOrderVariations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, GitBranch, Loader2, Copy, ExternalLink, CheckCircle, XCircle, Clock, Ban, ChevronDown, ChevronUp, Send } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { EntityCustomFieldsSection } from "@/components/shared/EntityCustomFieldsSection";
import { usePermissions } from "@/hooks/usePermissions";
import { emptyVariationDraft, prepareVariation, type VariationDraft } from "@/lib/orders/variationDraft";
import { VariationEditor, type VariationContext } from "./VariationEditor";
import {variationDocumentContext} from "@/lib/orders/variationDocumentContext";
import { variationEventDate } from "@/lib/orders/pendingVariationDocument";
import { PendingVariationPdf } from "./PendingVariationPdf";
import { VariationTemplatePicker } from "./VariationTemplatePicker";

interface OdVSectionProps {
  orderId: string;
  companyId: string;
  context?: VariationContext;
  onOpenDocuments?:()=>void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  in_attesa: { label: "In attesa", className: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  approvato: { label: "Approvato", className: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle },
  rifiutato: { label: "Rifiutato", className: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
  annullato: { label: "Annullato", className: "bg-slate-100 text-slate-600 border-slate-200", icon: Ban },
};

export function OdVSection({ orderId, companyId, context = {}, onOpenDocuments }: OdVSectionProps) {
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<VariationDraft>(emptyVariationDraft);
  const [review, setReview] = useState(false);
  const [formError, setFormError] = useState("");
  const createLock = useRef(false);
  const pdfLock=useRef(false);
  const [deliveryMode,setDeliveryMode]=useState<"pdf"|"online">("pdf");
  const [pdfBusy,setPdfBusy]=useState(false);
  const [pdfReady,setPdfReady]=useState<{url:string;filename:string;snapshot:string}|null>(null);
  const documentContext=variationDocumentContext(form,context);
  const documentSnapshot=JSON.stringify([form,documentContext]);
  const sending = useRef(new Set<string>());
  const [expandedOdvId, setExpandedOdvId] = useState<string | null>(null);
  const [invioEmailLoading, setInvioEmailLoading] = useState<string | null>(null);

  const { data: odvList = [], isLoading, isError, refetch } = useOrderVariations(orderId, companyId);
  // Lightweight, tenant-scoped and loaded only while composing a variation.
  const phases = useQuery({ queryKey: ["variation-phase-options",orderId,companyId], enabled: dialogOpen && !!orderId && !!companyId,
    queryFn: async () => {
      const {data,error} = await supabase.from("order_work_phases").select("id,name,end_date").eq("order_id",orderId).eq("company_id",companyId).order("position");
      if (error) throw error;
      return data ?? [];
    }, staleTime: 30_000 });

  // Total approved variazioni
  const totaleApprovato = odvList
    .filter(o => o.status === "approvato")
    .reduce((sum, o) => sum + Number(o.impatto_economico || 0), 0);

  const createOdv = useMutation({
    mutationFn: async () => {
      if (deliveryMode!=="online" || !permissions.canEditOrders || !orderId || !companyId || !review) throw new Error("Non hai il permesso di creare questa variante.");
      const prepared = prepareVariation(form);
      if (context.currentNet !== undefined && context.currentNet + prepared.impatto_economico < 0)
        throw new Error("La riduzione supera il valore del contratto: verifica l'importo.");
      if (isLoading || isError) throw new Error("Attendi il caricamento delle varianti prima di aggiungerne una");

      // Get next numero_odv
      const nextNumero = (odvList.length > 0
        ? Math.max(...odvList.map(o => o.numero_odv)) + 1
        : 1);

      // Generate unique firma_token
      const firmaToken = crypto.randomUUID();

      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user?.id;
      if (!userId) throw new Error("Sessione scaduta: accedi nuovamente");

      const { data, error } = await supabase
        .from("ordini_variazione")
        .insert({
          company_id: companyId,
          order_id: orderId,
          numero_odv: nextNumero,
          ...prepared,
          firma_token: firmaToken,
          status: "in_attesa",
          created_by: userId,
        })
        .select()
        .single();

      if (error?.code === "23505") {
        void refetch();
        throw new Error("Un'altra variante è stata creata nel frattempo. Aggiorna l'elenco e riprova: la bozza è conservata.");
      }
      if (error) throw new Error("Non è stato possibile confermare il salvataggio. Controlla l'elenco prima di riprovare.");
      if (!data?.id || data.order_id !== orderId || data.company_id !== companyId || data.firma_token !== firmaToken)
        throw new Error("Risposta di salvataggio non verificabile: aggiorna l'elenco prima di riprovare.");
      return { odv: data, firmaToken };
    },
    onSuccess: ({ odv, firmaToken }) => {
      const firmaUrl = `${window.location.origin}/firma-odv/${firmaToken}`;
      queryClient.invalidateQueries({ queryKey: ["ordini-variazione", orderId] });
      // Invalida anche la vista di marginalità (i consuntivi cambiano con le OdV approvate)
      queryClient.invalidateQueries({ queryKey: ["marginalita-cantieri"] });
      queryClient.invalidateQueries({ queryKey: ["marginalita-widget"] });
      setDialogOpen(false);
      setForm(emptyVariationDraft());
      setReview(false);
      toast.success(`OdV #${odv.numero_odv} creato. Link firma generato.`, {
        description: firmaUrl,
        action: {
          label: "Copia link",
          onClick: () => {
            void copyFirmaLink(firmaToken);
          },
        },
        duration: 10000,
      });
    },
    onError: (err: Error) => { setFormError(err.message); toast.error(err.message); },
    onSettled: () => { createLock.current = false; },
  });

  const copyFirmaLink = async (token: string) => {
    const url = `${window.location.origin}/firma-odv/${token}`;
    try { await navigator.clipboard.writeText(url); toast.success("Link di firma copiato!"); }
    catch { toast.error("Copia non riuscita. Apri il link e copialo dalla barra degli indirizzi."); }
  };
  const reviewDraft = () => {
    try { const prepared = prepareVariation(form);
      if (context.currentNet !== undefined && context.currentNet + prepared.impatto_economico < 0) throw new Error("La riduzione supera il valore del contratto.");
      setFormError(""); setReview(true);
    } catch (error) { setFormError(error instanceof Error ? error.message : "Controlla la bozza."); }
  };
  const prepareDocument=async()=>{
    if(pdfLock.current || !permissions.canEditOrders || !review)return;
    pdfLock.current=true;setPdfBusy(true);setFormError("");
    try{
      const prepared=prepareVariation(form);
      const {variationProposalPdf,variationPdfFilename}=await import("@/lib/orders/variationPreviewPdf");
      const doc=await variationProposalPdf(prepared,documentContext);
      setPdfReady({url:doc.output("datauristring"),filename:variationPdfFilename(documentContext.orderCode,prepared.titolo),snapshot:documentSnapshot});
    }catch(e){setFormError(e instanceof Error?e.message:"PDF non disponibile: la bozza è conservata.");}
    finally{pdfLock.current=false;setPdfBusy(false);}
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 min-w-0 text-base">
            <GitBranch className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">Lavori extra e varianti</span>
            {odvList.length > 0 && (
              <Badge variant="secondary" className="shrink-0 text-xs">{odvList.length}</Badge>
            )}
          </CardTitle>
          {permissions.canEditOrders && <Button size="sm" className="shrink-0" disabled={isLoading || isError} onClick={() => { setFormError(""); setReview(false);setDeliveryMode("pdf");setPdfReady(null);setForm({...emptyVariationDraft(),documentCompanyName:context.companyName,documentCompanyDetails:context.companyDetails,documentCustomerName:context.customerName,documentCustomerDetails:context.customerAddress}); setDialogOpen(true); }} aria-label="Nuova variante">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline ml-1.5">Nuova variante</span>
          </Button>}
        </CardHeader>

        <CardContent className="space-y-3">
          {isError ? <div role="alert" className="text-sm text-destructive">Varianti non disponibili. <Button variant="outline" size="sm" onClick={() => refetch()}>Riprova</Button></div> : isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : odvList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4 max-sm:py-2 max-sm:text-xs">
              Nessuna variante registrata.<span className="max-sm:hidden"> Puoi preparare un PDF da inviare oppure usare la firma online.</span>
            </p>
          ) : (
            <div className="space-y-2">
              {odvList.map(odv => {
                const cfg = STATUS_CONFIG[odv.status] || STATUS_CONFIG.in_attesa;
                const StatusIcon = cfg.icon;
                return (
                  <div key={odv.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-mono text-muted-foreground shrink-0">OdV #{odv.numero_odv}</span>
                          <span className="font-medium text-sm truncate">{odv.titolo}</span>
                        </div>
                        {odv.richiesto_da && (
                          <p className="text-xs text-muted-foreground mt-0.5">Richiesto da: {odv.richiesto_da}</p>
                        )}
                      </div>
                      <Badge className={`${cfg.className} text-xs shrink-0 flex items-center gap-1 border`}>
                        <StatusIcon className="h-3 w-3" />
                        {cfg.label}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2">{odv.descrizione}</p>

                    {/* Campi personalizzati — espandibili */}
                    <button
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setExpandedOdvId(expandedOdvId === odv.id ? null : odv.id)}
                    >
                      {expandedOdvId === odv.id
                        ? <><ChevronUp className="h-3 w-3" /> Nascondi campi personalizzati</>
                        : <><ChevronDown className="h-3 w-3" /> Campi personalizzati</>
                      }
                    </button>
                    {expandedOdvId === odv.id && (
                      <EntityCustomFieldsSection
                        entityType="ordini_variazione"
                        entityId={odv.id}
                      />
                    )}

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="font-semibold text-sm">{formatCurrency(odv.impatto_economico)}</span>
                        {odv.impatto_giorni > 0 && (
                          <span className="text-muted-foreground">+{odv.impatto_giorni}gg</span>
                        )}
                        {variationEventDate(odv.firmato_il) && (
                          <span className="text-muted-foreground">
                            {odv.status === "approvato" ? "Approvato" : odv.status === "rifiutato" ? "Rifiutato" : "Elaborato"} {variationEventDate(odv.firmato_il)}
                          </span>
                        )}
                      </div>
                      {permissions.canEditOrders && odv.status === "in_attesa" && <PendingVariationPdf variation={odv} orderId={orderId} companyId={companyId} context={context} onOpenDocuments={onOpenDocuments} />}
                      {permissions.canEditOrders && odv.status === "in_attesa" && odv.firma_token && (
                        <div className="flex gap-1 flex-wrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => copyFirmaLink(odv.firma_token)}
                          >
                            <Copy className="h-3 w-3 mr-1" /> Copia link
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-blue-600 hover:text-blue-700"
                            disabled={invioEmailLoading === odv.id}
                            onClick={async () => {
                              if (sending.current.has(odv.id) || !permissions.canEditOrders) return;
                              sending.current.add(odv.id);
                              setInvioEmailLoading(odv.id);
                              try {
                                const { data, error } = await supabase.functions.invoke("invia-odv", {
                                  body: { odv_id: odv.id },
                                });
                                if (error || data?.success !== true) throw error || new Error("Invio non confermato");
                                toast.success("Email inviata al cliente");
                                queryClient.invalidateQueries({ queryKey: ["ordini-variazione", orderId] });
                              } catch (e: unknown) {
                                toast.error(e instanceof Error ? e.message : "Errore nell'invio email");
                              } finally {
                                sending.current.delete(odv.id);
                                setInvioEmailLoading(null);
                              }
                            }}
                          >
                            {invioEmailLoading === odv.id
                              ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              : <Send className="h-3 w-3 mr-1" />}
                            Invia per email
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => window.open(`/firma-odv/${odv.firma_token}`, "_blank")}
                            aria-label="Apri link firma"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {odvList.some(o => o.status === "approvato") && (
                <div className="border-t pt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Totale variazioni approvate</span>
                  <span className="font-semibold text-green-700">{formatCurrency(totaleApprovato)}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={open => { if (createLock.current || createOdv.isPending || pdfLock.current) return; setDialogOpen(open); if (!open) {setForm(emptyVariationDraft());setReview(false);setFormError("");setPdfReady(null);} }}>
        <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b p-4 pr-10">
            <DialogTitle>{review ? "Controlla la variante" : "Nuovi lavori extra o variante"}</DialogTitle>
            <DialogDescription>{review ? "Scarica il documento e invialo come preferisci. La firma tramite link è facoltativa." : "Descrivi cosa cambia. Poi scegli PDF da inviare o firma online."}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto p-4">
            {!review && <VariationTemplatePicker companyId={companyId} draft={form} context={documentContext} disabled={createOdv.isPending || pdfBusy || !permissions.canEditOrders} onApply={draft => { setForm(draft); setFormError(""); setPdfReady(null); }} />}
            {phases.isError && <p role="alert" className="mb-3 text-sm text-destructive">Lavorazioni non disponibili. Puoi riferire la variante a tutta la commessa. <Button size="sm" variant="ghost" onClick={() => void phases.refetch()}>Riprova</Button></p>}
            <VariationEditor draft={form} setDraft={draft => {setForm(draft);setFormError("");setPdfReady(null);}} phases={phases.data ?? []} context={documentContext} busy={createOdv.isPending || pdfBusy || !permissions.canEditOrders} review={review} onBack={() => {setReview(false);setPdfReady(null);}} error={formError} showPdfPreview={false}/>
            {review && <div className="mt-4 space-y-3 rounded-lg border p-3" aria-label="Come vuoi usare il documento">
              <p className="text-sm font-medium">Come vuoi usarlo?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label="Modalità documento">
                <Button type="button" variant={deliveryMode==="pdf"?"default":"outline"} aria-pressed={deliveryMode==="pdf"} disabled={pdfBusy || createOdv.isPending} onClick={()=>setDeliveryMode("pdf")}>PDF da inviare</Button>
                <Button type="button" variant={deliveryMode==="online"?"default":"outline"} aria-pressed={deliveryMode==="online"} disabled={pdfBusy || createOdv.isPending} onClick={()=>setDeliveryMode("online")}>Firma online · facoltativa</Button>
              </div>
              <p className="text-xs text-muted-foreground">{deliveryMode==="pdf"?"Nessun link o invio automatico. Scarica il PDF, invialo per email o stampalo. La copia firmata può essere caricata nei Documenti della commessa." : "Confermando si registra l'OdV in attesa e si crea un link attivo. L'invio al cliente resta un passaggio separato."}</p>
              {deliveryMode==="pdf" && pdfReady?.snapshot===documentSnapshot && <div className="space-y-2">
                <p role="status" className="text-sm font-medium">PDF pronto. Scaricalo prima di chiudere.</p>
                <p className="text-xs text-muted-foreground">Il PDF non è firmato né approvato. Caricare una copia nei Documenti non cambia automaticamente l'importo della commessa o lo stato della variante.</p>
                {onOpenDocuments && <Button variant="outline" size="sm" onClick={()=>{setDialogOpen(false);setForm(emptyVariationDraft());setPdfReady(null);setReview(false);onOpenDocuments();}}>Apri Documenti commessa</Button>}
              </div>}
            </div>}
            <p className="mt-4 text-xs text-muted-foreground">La bozza e gli appunti privati non vengono conservati chiudendo il modulo. Scarica il documento prima di uscire.</p>
          </div>
          <DialogFooter className="shrink-0 border-t p-4 gap-2">
            <Button className="h-auto min-h-11 whitespace-normal px-3" variant="outline" disabled={createOdv.isPending || pdfBusy} onClick={() => {setDialogOpen(false);setForm(emptyVariationDraft());setReview(false);setPdfReady(null);}}>Chiudi</Button>
            {review && deliveryMode==="pdf" && pdfReady?.snapshot===documentSnapshot ? <a href={pdfReady.url} download={pdfReady.filename} className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-center text-sm font-medium text-primary-foreground">Scarica PDF da inviare</a> : <Button className="h-auto min-h-11 whitespace-normal px-3" disabled={createOdv.isPending || pdfBusy || !permissions.canEditOrders || isLoading || isError} onClick={() => {
              if (!review) {reviewDraft();return;}
              if(deliveryMode==="pdf"){void prepareDocument();return;}
              if (createLock.current) return;
              createLock.current = true;setFormError("");createOdv.mutate();
            }}>{pdfBusy ? "Preparo PDF…" : createOdv.isPending ? "Salvataggio…" : !review ? "Controlla riepilogo" : deliveryMode==="pdf" ? "Prepara PDF da inviare" : "Conferma e crea link"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
