import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { campaignPreparationRequest, readPreparedCampaignRecipients, type PreparedCampaignRecipients } from "@/lib/campaignPreparation";
import { CampaignRecipientsDialog } from "./CampaignRecipientsDialog";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  Plus, Play, Pause, Trash2, Megaphone, CheckCircle2, Phone, BarChart3,
  Calendar, Loader2, Users,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface Campaign {
  id: string;
  nome: string;
  descrizione: string | null;
  agent_id: string;
  stato: string;
  tipo: string;
  totale_contatti: number;
  chiamate_effettuate: number;
  chiamate_completate: number;
  chiamate_no_risposta: number;
  tasso_risposta: number;
  crediti_utilizzati: number;
  data_inizio: string | null;
  data_fine: string | null;
  schedulata_il: string | null;
  creato_il: string;
  aggiornato_il: string;
  metadata?: { preparazione_destinatari?: PreparedCampaignRecipients; errore_esecuzione?: string } | null;
  orario_inizio?: string;
  orario_fine?: string;
  fuso_orario?: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  bozza: { label: "Bozza", variant: "secondary" },
  in_corso: { label: "In corso", variant: "default" },
  completata: { label: "Completata", variant: "secondary" },
  pausa: { label: "In pausa", variant: "destructive" },
  archiviata: { label: "Archiviata", variant: "outline" },
};

export function CampagneTab() {
  const companyId = useEffectiveCompanyId();
  const { solaLettura } = usePermissions();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [form, setForm] = useState({ nome: "", descrizione: "", agent_id: "", tipo: "chiamata" });
  const [recipientCampaign, setRecipientCampaign] = useState<Campaign | null>(null);
  const [confirmCampaign, setConfirmCampaign] = useState<Campaign | null>(null);
  const draftId = useRef<string | null>(null);
  const activeCompany = useRef(companyId);
  activeCompany.current = companyId;
  useEffect(() => {
    setShowCreateDialog(false); setRecipientCampaign(null); setConfirmCampaign(null); setCreateStep(1); setStatusFilter("all");
    setForm({ nome: "", descrizione: "", agent_id: "", tipo: "chiamata" }); draftId.current = null;
  }, [companyId]);
  const openCreate = () => { draftId.current ??= crypto.randomUUID(); setShowCreateDialog(true); };

  const { data: campaignResult, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["ai-campaigns-v2", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      return campaignPreparationRequest<{ campaigns: Campaign[]; dispatch_enabled: boolean }>(companyId!, "list_campaigns");
    },
    retry: false, refetchInterval: 60_000,
  });
  const campaigns: Campaign[] = Array.isArray(campaignResult) ? campaignResult : campaignResult?.campaigns || [];
  const dispatchEnabled = !Array.isArray(campaignResult) && campaignResult?.dispatch_enabled === true;
  const controlMutation = useMutation({
    mutationFn: async ({ campaign, action }: { campaign: Campaign; action: "start_campaign" | "pause_campaign" }) => {
      if (!companyId || solaLettura) throw new Error("Modifica non consentita");
      await campaignPreparationRequest(companyId, action, { campaign_id: campaign.id, updated_at: campaign.aggiornato_il });
      return { savedCompany: companyId, action };
    },
    onSuccess: ({ savedCompany, action }) => {
      queryClient.invalidateQueries({ queryKey: ["ai-campaigns-v2", savedCompany] });
      if (savedCompany !== activeCompany.current) return;
      setConfirmCampaign(null);
      toast.success(action === "start_campaign" ? "Campagna in coda: le chiamate partiranno negli orari previsti" : "Campagna in pausa: eventuali chiamate già avviate termineranno normalmente");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { data: agents = [], isError: agentsError, isLoading: agentsLoading, refetch: reloadAgents } = useQuery({
    queryKey: ["ai-agents-v2-select", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const result = await campaignPreparationRequest<{ agents: { id: string; nome: string; tipo: string }[] }>(companyId!, "campaign_agents");
      return result.agents;
    },
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !form.agent_id || !form.nome.trim()) throw new Error("Inserisci nome e agente");
      if (!agents.some(a => a.id === form.agent_id)) throw new Error("Seleziona un agente vocale dell'azienda");
      if (!draftId.current) throw new Error("Riapri la creazione campagna");
      await campaignPreparationRequest(companyId, "create_campaign", {
        id: draftId.current,
        nome: form.nome.trim(),
        descrizione: form.descrizione || null,
        agent_id: form.agent_id,
      });
      return companyId;
    },
    onSuccess: savedCompany => {
      queryClient.invalidateQueries({ queryKey: ["ai-campaigns-v2", savedCompany] });
      if (activeCompany.current !== savedCompany) return;
      toast.success("Campagna creata");
      draftId.current = null;
      setShowCreateDialog(false);
      setCreateStep(1);
      setForm({ nome: "", descrizione: "", agent_id: "", tipo: "chiamata" });
    },
    onError: (err: Error) => toast.error(err.message || "Errore nella creazione"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (campaign: Campaign) => {
      if (!companyId) throw new Error("Nessuna azienda associata");
      await campaignPreparationRequest(companyId, "delete_campaign", { campaign_id: campaign.id, updated_at: campaign.aggiornato_il });
      return companyId;
    },
    onSuccess: savedCompany => {
      queryClient.invalidateQueries({ queryKey: ["ai-campaigns-v2", savedCompany] });
      toast.success("Campagna eliminata");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filtered = statusFilter === "all" ? campaigns : campaigns.filter((c) => c.stato === statusFilter);

  const statsActive = campaigns.filter((c) => c.stato === "in_corso").length;
  const statsCompleted = campaigns.filter((c) => c.stato === "completata").length;
  const statsCalls = campaigns.reduce((s, c) => s + (Number(c.chiamate_effettuate) || 0), 0);
  const statsRate = statsCalls > 0
    ? Math.round(campaigns.reduce((s, c) => s + (Number(c.chiamate_completate) || 0), 0) / statsCalls * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Campagne Outbound</h2>
          <p className="text-sm text-muted-foreground">Gestisci campagne di chiamate in uscita con i tuoi agenti AI</p>
        </div>
        <Button disabled={!companyId || isError || solaLettura} onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Nuova Campagna
        </Button>
      </div>
      {solaLettura && <p className="text-sm text-muted-foreground">Accesso in sola lettura: non puoi creare o modificare campagne.</p>}
      <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
        {dispatchEnabled ? "Avvio su conferma, una chiamata alla volta per azienda, negli orari previsti. Consenso, esclusioni e saldo vengono ricontrollati prima di ogni chiamata. Nessun richiamo automatico dopo un esito incerto."
          : "Qui puoi preparare bozze e selezionare destinatari CRM. L'esecutore massivo non è ancora attivo: nessuna chiamata parte da questa scheda."}
      </div>

      {/* Stats */}
      {!isLoading && !isError && <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Attive", value: statsActive, icon: Megaphone, color: "text-primary" },
          { label: "Completate", value: statsCompleted, icon: CheckCircle2, color: "text-primary/70" },
          { label: "Chiamate Totali", value: statsCalls, icon: Phone, color: "text-primary/60" },
          { label: "Tasso Risposta", value: `${statsRate}%`, icon: BarChart3, color: "text-primary/50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <s.icon className={`h-5 w-5 ${s.color}`} />
                {s.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>}
      {!isError && !isLoading && campaigns.length >= 500 && <p className="text-sm text-muted-foreground">Sono mostrate le 500 campagne più recenti. I contatori si riferiscono alle campagne caricate.</p>}

      {/* Filter */}
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filtra per stato" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tutti gli stati</SelectItem>
          <SelectItem value="bozza">Bozza</SelectItem>
          <SelectItem value="in_corso">In corso</SelectItem>
          <SelectItem value="completata">Completata</SelectItem>
          <SelectItem value="pausa">In pausa</SelectItem>
          <SelectItem value="archiviata">Archiviata</SelectItem>
        </SelectContent>
      </Select>

      {/* Campaign Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div role="alert" className="rounded-lg border p-4"><p>Impossibile caricare le campagne. {error?.message}</p>
          <Button variant="outline" className="mt-2" onClick={() => refetch()}>Riprova</Button></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Nessuna campagna trovata</p>
            <Button variant="outline" className="mt-4" disabled={!companyId || (solaLettura && statusFilter === "all")} onClick={statusFilter !== "all" ? () => setStatusFilter("all") : openCreate}>
              {statusFilter !== "all" ? "Mostra tutte le campagne" : <><Plus className="h-4 w-4 mr-2" /> Crea la prima campagna</>}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const badge = STATUS_MAP[c.stato] || STATUS_MAP.bozza;
            const prepared = readPreparedCampaignRecipients(c.metadata);
            const progress = c.totale_contatti > 0
              ? Math.min(100, Math.max(0, Math.round((c.chiamate_effettuate / c.totale_contatti) * 100)))
              : 0;
            return (
              <Card key={c.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{c.nome}</CardTitle>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  {c.descrizione && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{c.descrizione}</p>
                  )}
                  {c.metadata?.errore_esecuzione && <p role="alert" className="text-xs text-amber-700">{c.metadata.errore_esecuzione}</p>}
                </CardHeader>
                <CardContent className="space-y-3">
                  {c.stato === "bozza" && <div className="text-xs text-muted-foreground">{prepared?.recipients.length || 0} destinatari preparati · nessun invio
                    {!!prepared?.excluded.length && <span className="block text-amber-700">{prepared.excluded.length} esclusi dall'ultima selezione</span>}</div>}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <p className="font-mono font-bold text-foreground">{c.totale_contatti}</p>
                      <p className="text-muted-foreground">Contatti</p>
                    </div>
                    <div>
                      <p className="font-mono font-bold text-foreground">{c.chiamate_completate}</p>
                      <p className="text-muted-foreground">Risposte</p>
                    </div>
                    <div>
                      <p className="font-mono font-bold text-foreground">{Math.round(c.tasso_risposta)}%</p>
                      <p className="text-muted-foreground">Risposta</p>
                    </div>
                  </div>

                  {c.totale_contatti > 0 && (
                    <div className="space-y-1">
                      <Progress value={progress} className="h-2" />
                      <p className="text-[10px] text-muted-foreground text-right">{c.chiamate_effettuate} chiamate registrate / {c.totale_contatti} contatti</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {Number.isFinite(Date.parse(c.creato_il)) ? format(new Date(c.creato_il), "dd MMM yyyy", { locale: it }) : "Data non disponibile"}
                    </span>
                    <div className="flex gap-1">
                      {(c.stato === "bozza" || c.stato === "pausa") && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={!dispatchEnabled || solaLettura || controlMutation.isPending || (c.stato === "bozza" && !prepared?.recipients.length)}
                          aria-label={dispatchEnabled ? "Avvia campagna" : "Avvio massivo non disponibile"}
                          title={dispatchEnabled ? "Conferma avvio" : "Esecutore non attivo"}
                          onClick={() => setConfirmCampaign(c)}
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {c.stato === "in_corso" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={!dispatchEnabled || solaLettura || controlMutation.isPending}
                          aria-label={dispatchEnabled ? "Metti in pausa" : "Pausa massiva non disponibile"}
                          title="Blocca le prossime chiamate"
                          onClick={() => controlMutation.mutate({ campaign: c, action: "pause_campaign" })}
                        >
                          <Pause className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {c.stato === "bozza" && !solaLettura && <Button size="sm" variant="outline" onClick={() => setRecipientCampaign(c)}><Users className="h-3.5 w-3.5 mr-1" />Destinatari</Button>}
                      {c.stato === "bozza" && !solaLettura && Number(c.chiamate_effettuate || 0) === 0 && <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button aria-label={`Elimina bozza ${c.nome}`} disabled={deleteMutation.isPending} size="icon" variant="ghost" className="h-7 w-7">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminare la campagna?</AlertDialogTitle>
                            <AlertDialogDescription>Questa azione non può essere annullata.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(c)}>Elimina</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog — 3-step wizard */}
      <Dialog open={!!confirmCampaign} onOpenChange={open => { if (!open && !controlMutation.isPending) setConfirmCampaign(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Avviare {confirmCampaign?.nome}?</DialogTitle></DialogHeader>
          <p className="text-sm">Le chiamate consumano credito e partono una alla volta. Fascia {confirmCampaign?.orario_inizio?.slice(0,5) || "09:00"}–{confirmCampaign?.orario_fine?.slice(0,5) || "18:00"} ({confirmCampaign?.fuso_orario || "Europe/Rome"}), nei giorni configurati; per le nuove campagne, dal lunedì al venerdì.</p>
          <p className="text-sm text-muted-foreground">Puoi mettere in pausa le chiamate successive. I contatti non più idonei vengono esclusi; i timeout incerti bloccano la campagna per verifica, senza richiamare automaticamente.</p>
          <DialogFooter><Button variant="outline" disabled={controlMutation.isPending} onClick={() => setConfirmCampaign(null)}>Annulla</Button>
            <Button disabled={controlMutation.isPending || solaLettura || !dispatchEnabled} onClick={() => confirmCampaign && controlMutation.mutate({campaign:confirmCampaign,action:"start_campaign"})}>
              {controlMutation.isPending ? "Avvio..." : "Conferma e avvia"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {recipientCampaign && companyId && <CampaignRecipientsDialog key={`${companyId}:${recipientCampaign.id}`} companyId={companyId} campaign={recipientCampaign} onClose={() => setRecipientCampaign(null)} />}
      <Dialog open={showCreateDialog} onOpenChange={open => { if (!createMutation.isPending) setShowCreateDialog(open); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuova Campagna — Step {createStep}/3</DialogTitle>
          </DialogHeader>

          {createStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome campagna</Label>
                <Input
                  maxLength={160}
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Es. Richiamo lead freddi"
                />
              </div>
              <div className="space-y-2">
                <Label>Descrizione (opzionale)</Label>
                <Textarea
                  value={form.descrizione}
                  onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
                  placeholder="Obiettivo della campagna..."
                  rows={3}
                  maxLength={2000}
                />
              </div>
            </div>
          )}

          {createStep === 2 && (
            <div className="space-y-4">
              {agentsError && <div role="alert">Impossibile caricare gli agenti. <Button variant="outline" onClick={() => reloadAgents()}>Riprova</Button></div>}
              {agentsLoading && <p>Caricamento agenti…</p>}
              {!agentsLoading && !agentsError && !agents.length && <p className="text-sm text-muted-foreground">Crea prima un agente vocale nella scheda Agenti.</p>}
              <div className="space-y-2">
                <Label>Agente AI</Label>
                <Select value={form.agent_id} onValueChange={(v) => setForm({ ...form, agent_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona agente" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nome} ({a.tipo})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo campagna</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chiamata">Chiamate in uscita</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {createStep === 3 && (
            <div className="space-y-3">
              <Card className="bg-muted/50">
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nome</span>
                    <span className="font-medium">{form.nome}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Agente</span>
                    <span className="font-medium">{agents.find((a) => a.id === form.agent_id)?.nome || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipo</span>
                    <span className="font-medium capitalize">{form.tipo.replace("_", " ")}</span>
                  </div>
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground">
                La campagna verrà salvata come bozza, senza effettuare chiamate. Potrai selezionare i destinatari CRM dalla sua scheda. L'avvio massivo resta disabilitato.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            {createStep > 1 && (
              <Button variant="outline" disabled={createMutation.isPending} onClick={() => setCreateStep(createStep - 1)}>Indietro</Button>
            )}
            {createStep < 3 ? (
              <Button
                onClick={() => setCreateStep(createStep + 1)}
                disabled={createStep === 1 ? !form.nome.trim() : agentsError || agentsLoading || !agents.some(a => a.id === form.agent_id)}
              >
                Avanti
              </Button>
            ) : (
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creazione..." : "Crea Campagna"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
