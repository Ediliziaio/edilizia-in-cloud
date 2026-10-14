import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  bozza: { label: "Bozza", className: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  in_attesa: { label: "In attesa", className: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  approvato: { label: "Approvato", className: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle },
  rifiutato: { label: "Rifiutato", className: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
  annullato: { label: "Annullato", className: "bg-slate-100 text-slate-600 border-slate-200", icon: Ban },
};

export function OdVSection({ orderId, companyId, context = {}, onOpenDocuments }: OdVSectionProps) {
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{id:string;existing:boolean}|null>(null);
  const sending = useRef(new Set<string>());
  const [expandedOdvId, setExpandedOdvId] = useState<string | null>(null);
  const [invioEmailLoading, setInvioEmailLoading] = useState<string | null>(null);

  const { data: odvList = [], isLoading, isError, refetch } = useOrderVariations(orderId, companyId);
  // Total approved variazioni
  const totaleApprovato = odvList
    .filter(o => o.status === "approvato")
    .reduce((sum, o) => sum + Number(o.impatto_economico || 0), 0);

  const copyFirmaLink = async (token: string) => {
    const url = `${window.location.origin}/firma-odv/${token}`;
    try { await navigator.clipboard.writeText(url); toast.success("Link di firma copiato!"); }
    catch { toast.error("Copia non riuscita. Apri il link e copialo dalla barra degli indirizzi."); }
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
          {permissions.canEditOrders && <Button size="sm" className="shrink-0" disabled={isLoading || isError} onClick={() => setEditing({id:crypto.randomUUID(),existing:false})} aria-label="Nuova variante">
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
              {odvList.map(raw => {
                const odv = raw as WorkflowVariation;
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
                        {variationEventDate(odv.offline_signed_on ?? odv.firmato_il) && (
                          <span className="text-muted-foreground">
                            {odv.status === "approvato" ? "Approvato" : odv.status === "rifiutato" ? "Rifiutato" : "Elaborato"} {variationEventDate(odv.offline_signed_on ?? odv.firmato_il)}
                          </span>
                        )}
                      </div>
                      {permissions.canEditOrders && odv.status === "in_attesa" && !odv.current_document_id && <PendingVariationPdf variation={odv} orderId={orderId} companyId={companyId} context={context} onOpenDocuments={onOpenDocuments} />}
                      {permissions.canEditOrders && <Button variant="outline" size="sm" onClick={() => setEditing({id:odv.id,existing:true})}>{odv.status === "bozza" ? "Riprendi bozza" : "Documento e approvazione"}</Button>}
                      {permissions.canEditOrders && odv.status === "in_attesa" && odv.firma_token && !odv.link_revoked_at && (!odv.link_expires_at || new Date(odv.link_expires_at).getTime() > Date.now()) && (
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

      {editing && <VariationLifecycleDialog key={`${companyId}:${orderId}:${editing.id}`} id={editing.id} existing={editing.existing} order={orderId} company={companyId} context={context} canEdit={permissions.canEditOrders} onClose={() => setEditing(null)} />}
    </>
  );
}
