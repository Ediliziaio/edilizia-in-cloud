import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, GitBranch, Loader2, Copy, ExternalLink, CheckCircle, XCircle, Clock, Ban, ChevronDown, ChevronUp, Send } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import { EntityCustomFieldsSection } from "@/components/shared/EntityCustomFieldsSection";

interface OdVSectionProps {
  orderId: string;
  companyId: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  in_attesa: { label: "In attesa", className: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  approvato: { label: "Approvato", className: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle },
  rifiutato: { label: "Rifiutato", className: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
  annullato: { label: "Annullato", className: "bg-slate-100 text-slate-600 border-slate-200", icon: Ban },
};

interface OdVForm {
  titolo: string;
  descrizione: string;
  motivazione: string;
  impatto_economico: string;
  impatto_giorni: string;
  richiesto_da: string;
  note_interne: string;
}

const EMPTY_FORM: OdVForm = {
  titolo: "",
  descrizione: "",
  motivazione: "",
  impatto_economico: "",
  impatto_giorni: "0",
  richiesto_da: "",
  note_interne: "",
};

export function OdVSection({ orderId, companyId }: OdVSectionProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<OdVForm>(EMPTY_FORM);
  const [expandedOdvId, setExpandedOdvId] = useState<string | null>(null);
  const [invioEmailLoading, setInvioEmailLoading] = useState<string | null>(null);

  const { data: odvList = [], isLoading } = useQuery({
    queryKey: ["ordini-variazione", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordini_variazione")
        .select("*")
        .eq("order_id", orderId)
        .eq("company_id", companyId)
        .order("numero_odv", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!orderId && !!companyId,
  });

  // Total approved variazioni
  const totaleApprovato = odvList
    .filter((o: any) => o.status === "approvato")
    .reduce((sum: number, o: any) => sum + Number(o.impatto_economico || 0), 0);

  const createOdv = useMutation({
    mutationFn: async () => {
      if (!form.titolo.trim()) throw new Error("Il titolo è obbligatorio");
      if (!form.descrizione.trim()) throw new Error("La descrizione è obbligatoria");
      const importo = parseFloat(form.impatto_economico);
      if (isNaN(importo) || importo < 0) throw new Error("Importo non valido");

      // Get next numero_odv
      const nextNumero = (odvList.length > 0
        ? Math.max(...odvList.map((o: any) => o.numero_odv)) + 1
        : 1);

      // Generate unique firma_token
      const firmaToken = crypto.randomUUID();

      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user?.id;

      const { data, error } = await supabase
        .from("ordini_variazione")
        .insert({
          company_id: companyId,
          order_id: orderId,
          numero_odv: nextNumero,
          titolo: form.titolo.trim(),
          descrizione: form.descrizione.trim(),
          motivazione: form.motivazione.trim() || null,
          impatto_economico: importo,
          impatto_giorni: parseInt(form.impatto_giorni) || 0,
          richiesto_da: form.richiesto_da.trim() || null,
          note_interne: form.note_interne.trim() || null,
          firma_token: firmaToken,
          status: "in_attesa",
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return { odv: data, firmaToken };
    },
    onSuccess: ({ odv, firmaToken }) => {
      const firmaUrl = `${window.location.origin}/firma-odv/${firmaToken}`;
      queryClient.invalidateQueries({ queryKey: ["ordini-variazione", orderId] });
      // Invalida anche la vista di marginalità (i consuntivi cambiano con le OdV approvate)
      queryClient.invalidateQueries({ queryKey: ["marginalita-cantieri"] });
      queryClient.invalidateQueries({ queryKey: ["marginalita-widget"] });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      toast.success(`OdV #${odv.numero_odv} creato. Link firma generato.`, {
        description: firmaUrl,
        action: {
          label: "Copia link",
          onClick: () => {
            navigator.clipboard.writeText(firmaUrl);
            toast.success("Link copiato!");
          },
        },
        duration: 10000,
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const copyFirmaLink = (token: string) => {
    const url = `${window.location.origin}/firma-odv/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link di firma copiato!");
  };

  const f = (key: keyof OdVForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [key]: e.target.value }));

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 min-w-0 text-base">
            <GitBranch className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">Ordini di Variazione</span>
            {odvList.length > 0 && (
              <Badge variant="secondary" className="shrink-0 text-xs">{odvList.length}</Badge>
            )}
          </CardTitle>
          <Button size="sm" className="shrink-0" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline ml-1.5">Nuovo OdV</span>
          </Button>
        </CardHeader>

        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : odvList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessun ordine di variazione. I lavori extra richiedono un OdV firmato dal cliente.
            </p>
          ) : (
            <div className="space-y-2">
              {odvList.map((odv: any) => {
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
                        {odv.firmato_il && (
                          <span className="text-muted-foreground">
                            Firmato {format(new Date(odv.firmato_il), "dd/MM/yy", { locale: it })}
                          </span>
                        )}
                      </div>
                      {odv.status === "in_attesa" && odv.firma_token && (
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
                              setInvioEmailLoading(odv.id);
                              try {
                                const { error } = await supabase.functions.invoke("invia-odv", {
                                  body: { odv_id: odv.id },
                                });
                                if (error) throw error;
                                toast.success("Email inviata al cliente");
                                queryClient.invalidateQueries({ queryKey: ["ordini-variazione", orderId] });
                              } catch (e: any) {
                                toast.error(e.message || "Errore nell'invio email");
                              } finally {
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

              {totaleApprovato > 0 && (
                <div className="border-t pt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Totale variazioni approvate</span>
                  <span className="font-semibold text-green-700">{formatCurrency(totaleApprovato)}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog Nuovo OdV ── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setForm(EMPTY_FORM); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-primary" />
              Nuovo Ordine di Variazione
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Titolo *</Label>
              <Input placeholder="es. Aggiunta impianto di ventilazione" value={form.titolo} onChange={f("titolo")} />
            </div>

            <div className="space-y-1.5">
              <Label>Descrizione lavori extra *</Label>
              <Textarea
                placeholder="Descrivi dettagliatamente i lavori aggiuntivi non previsti nel contratto originale..."
                value={form.descrizione}
                onChange={f("descrizione")}
                rows={4}
                className="resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Motivazione</Label>
              <Textarea
                placeholder="Perché questi lavori sono necessari o richiesti dal cliente..."
                value={form.motivazione}
                onChange={f("motivazione")}
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Importo aggiuntivo (€) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.impatto_economico}
                  onChange={f("impatto_economico")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Giorni aggiuntivi</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.impatto_giorni}
                  onChange={f("impatto_giorni")}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Richiesto da</Label>
              <Input placeholder="Nome cliente o responsabile" value={form.richiesto_da} onChange={f("richiesto_da")} />
            </div>

            <div className="space-y-1.5">
              <Label>Note interne</Label>
              <Input placeholder="Note visibili solo internamente" value={form.note_interne} onChange={f("note_interne")} />
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-700">
              <GitBranch className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Verrà generato un link univoco di firma da inviare al cliente. I lavori dovranno essere approvati prima di iniziare.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={() => createOdv.mutate()} disabled={createOdv.isPending}>
              {createOdv.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvataggio...</>
                : <><GitBranch className="h-4 w-4 mr-2" /> Salva e invia per firma</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
