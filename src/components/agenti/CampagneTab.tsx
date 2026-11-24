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
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

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
  const t = useT();
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
      if (!companyId || solaLettura) throw new Error(t("Modifica non consentita"));
      await campaignPreparationRequest(companyId, action, { campaign_id: campaign.id, updated_at: campaign.aggiornato_il });
      return { savedCompany: companyId, action };
    },
    onSuccess: ({ savedCompany, action }) => {
      queryClient.invalidateQueries({ queryKey: ["ai-campaigns-v2", savedCompany] });
      if (savedCompany !== activeCompany.current) return;
      setConfirmCampaign(null);
      toast.success(action === "start_campaign" ? t("Campagna in coda: le chiamate partiranno negli orari previsti") : t("Campagna in pausa: eventuali chiamate già avviate termineranno normalmente"));
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
      if (!companyId || !form.agent_id || !form.nome.trim()) throw new Error(t("Inserisci nome e agente"));
      if (!agents.some(a => a.id === form.agent_id)) throw new Error(t("Seleziona un agente vocale dell'azienda"));
      if (!draftId.current) throw new Error(t("Riapri la creazione campagna"));
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
      toast.success(t("Campagna creata"));
      draftId.current = null;
      setShowCreateDialog(false);
      setCreateStep(1);
      setForm({ nome: "", descrizione: "", agent_id: "", tipo: "chiamata" });
    },
    onError: (err: Error) => toast.error(err.message || t("Errore nella creazione")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (campaign: Campaign) => {
      if (!companyId) throw new Error(t("Nessuna azienda associata"));
      await campaignPreparationRequest(companyId, "delete_campaign", { campaign_id: campaign.id, updated_at: campaign.aggiornato_il });
      return companyId;
    },
    onSuccess: savedCompany => {
      queryClient.invalidateQueries({ queryKey: ["ai-campaigns-v2", savedCompany] });
      toast.success(t("Campagna eliminata"));
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
          <h2 className="text-xl font-bold text-foreground">{t("Campagne Outbound")}</h2>
          <p className="text-sm text-muted-foreground">{t("Gestisci campagne di chiamate in uscita con i tuoi agenti AI")}</p>
        </div>
        <Button disabled={!companyId || isError || solaLettura} onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> {t("Nuova Campagna")}
        </Button>
      </div>
      {solaLettura && <p className="text-sm text-muted-foreground">{t("Accesso in sola lettura: non puoi creare o modificare campagne.")}</p>}
      <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
        {dispatchEnabled ? t("Avvio su conferma, una chiamata alla volta per azienda, negli orari previsti. Consenso, esclusioni e saldo vengono ricontrollati prima di ogni chiamata. Nessun richiamo automatico dopo un esito incerto.")
          : t("Qui puoi preparare bozze e selezionare destinatari CRM. L'esecutore massivo non è ancora attivo: nessuna chiamata parte da questa scheda.")}
      </div>

      {/* Stats */}
      {!isLoading && !isError && <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t("Attive"), value: statsActive, icon: Megaphone, color: "text-primary" },
          { label: t("Completate"), value: statsCompleted, icon: CheckCircle2, color: "text-primary/70" },
          { label: t("Chiamate Totali"), value: statsCalls, icon: Phone, color: "text-primary/60" },
          { label: t("Tasso Risposta"), value: `${statsRate}%`, icon: BarChart3, color: "text-primary/50" },
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
      {!isError && !isLoading && campaigns.length >= 500 && <p className="text-sm text-muted-foreground">{t("Sono mostrate le 500 campagne più recenti. I contatori si riferiscono alle campagne caricate.")}</p>}

      {/* Filter */}
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder={t("Filtra per stato")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("Tutti gli stati")}</SelectItem>
          <SelectItem value="bozza">{t("Bozza")}</SelectItem>
          <SelectItem value="in_corso">{t("In corso")}</SelectItem>
          <SelectItem value="completata">{t("Completata")}</SelectItem>
          <SelectItem value="pausa">{t("In pausa")}</SelectItem>
          <SelectItem value="archiviata">{t("Archiviata")}</SelectItem>
        </SelectContent>
      </Select>

      {/* Campaign Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div role="alert" className="rounded-lg border p-4"><p>{t("Impossibile caricare le campagne. {message}", { message: String(error?.message ?? "") })}</p>
          <Button variant="outline" className="mt-2" onClick={() => refetch()}>{t("Riprova")}</Button></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>{t("Nessuna campagna trovata")}</p>
            <Button variant="outline" className="mt-4" disabled={!companyId || (solaLettura && statusFilter === "all")} onClick={statusFilter !== "all" ? () => setStatusFilter("all") : openCreate}>
              {statusFilter !== "all" ? t("Mostra tutte le campagne") : <><Plus className="h-4 w-4 mr-2" /> {t("Crea la prima campagna")}</>}
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
                    <Badge variant={badge.variant}>{t(badge.label)}</Badge>
                  </div>
                  {c.descrizione && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{c.descrizione}</p>
                  )}
                  {c.metadata?.errore_esecuzione && <p role="alert" className="text-xs text-amber-700">{c.metadata.errore_esecuzione}</p>}
                </CardHeader>
                <CardContent className="space-y-3">
                  {c.stato === "bozza" && <div className="text-xs text-muted-foreground">{t("{n} destinatari preparati · nessun invio", { n: prepared?.recipients.length || 0 })}
                    {!!prepared?.excluded.length && <span className="block text-amber-700">{t("{n} esclusi dall'ultima selezione", { n: prepared.excluded.length })}</span>}</div>}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <p className="font-mono font-bold text-foreground">{c.totale_contatti}</p>
                      <p className="text-muted-foreground">{t("Contatti")}</p>
                    </div>
                    <div>
                      <p className="font-mono font-bold text-foreground">{c.chiamate_completate}</p>
                      <p className="text-muted-foreground">{t("Risposte")}</p>
                    </div>
                    <div>
                      <p className="font-mono font-bold text-foreground">{Math.round(c.tasso_risposta)}%</p>
                      <p className="text-muted-foreground">{t("Risposta")}</p>
                    </div>
                  </div>

                  {c.totale_contatti > 0 && (
                    <div className="space-y-1">
                      <Progress value={progress} className="h-2" />
                      <p className="text-[10px] text-muted-foreground text-right">{t("{chiamate_effettuate} chiamate registrate / {totale_contatti} contatti", { chiamate_effettuate: String(c.chiamate_effettuate ?? ""), totale_contatti: String(c.totale_contatti ?? "") })}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {Number.isFinite(Date.parse(c.creato_il)) ? format(new Date(c.creato_il), "dd MMM yyyy", { locale: dateFnsCampo() }) : t("Data non disponibile")}
                    </span>
                    <div className="flex gap-1">
                      {(c.stato === "bozza" || c.stato === "pausa") && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={!dispatchEnabled || solaLettura || controlMutation.isPending || (c.stato === "bozza" && !prepared?.recipients.length)}
                          aria-label={dispatchEnabled ? t("Avvia campagna") : t("Avvio massivo non disponibile")}
                          title={dispatchEnabled ? t("Conferma avvio") : t("Esecutore non attivo")}
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
                          aria-label={dispatchEnabled ? t("Metti in pausa") : t("Pausa massiva non disponibile")}
                          title={t("Blocca le prossime chiamate")}
                          onClick={() => controlMutation.mutate({ campaign: c, action: "pause_campaign" })}
                        >
                          <Pause className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {c.stato === "bozza" && !solaLettura && <Button size="sm" variant="outline" onClick={() => setRecipientCampaign(c)}><Users className="h-3.5 w-3.5 mr-1" />{t("Destinatari")}</Button>}
                      {c.stato === "bozza" && !solaLettura && Number(c.chiamate_effettuate || 0) === 0 && <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button aria-label={t("Elimina bozza {nome}", { nome: String(c.nome ?? "") })} disabled={deleteMutation.isPending} size="icon" variant="ghost" className="h-7 w-7">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("Eliminare la campagna?")}</AlertDialogTitle>
                            <AlertDialogDescription>{t("Questa azione non può essere annullata.")}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(c)}>{t("Elimina")}</AlertDialogAction>
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
          <DialogHeader><DialogTitle>{t("Avviare {nome}?", { nome: String(confirmCampaign?.nome ?? "") })}</DialogTitle></DialogHeader>
          <p className="text-sm">{t("Le chiamate consumano credito e partono una alla volta. Fascia {inizio}–{fine} ({fuso}), nei giorni configurati; per le nuove campagne, dal lunedì al venerdì.", { inizio: confirmCampaign?.orario_inizio?.slice(0,5) || "09:00", fine: confirmCampaign?.orario_fine?.slice(0,5) || "18:00", fuso: confirmCampaign?.fuso_orario || "Europe/Rome" })}</p>
          <p className="text-sm text-muted-foreground">{t("Puoi mettere in pausa le chiamate successive. I contatti non più idonei vengono esclusi; i timeout incerti bloccano la campagna per verifica, senza richiamare automaticamente.")}</p>
          <DialogFooter><Button variant="outline" disabled={controlMutation.isPending} onClick={() => setConfirmCampaign(null)}>{t("Annulla")}</Button>
            <Button disabled={controlMutation.isPending || solaLettura || !dispatchEnabled} onClick={() => confirmCampaign && controlMutation.mutate({campaign:confirmCampaign,action:"start_campaign"})}>
              {controlMutation.isPending ? t("Avvio...") : t("Conferma e avvia")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {recipientCampaign && companyId && <CampaignRecipientsDialog key={`${companyId}:${recipientCampaign.id}`} companyId={companyId} campaign={recipientCampaign} onClose={() => setRecipientCampaign(null)} />}
      <Dialog open={showCreateDialog} onOpenChange={open => { if (!createMutation.isPending) setShowCreateDialog(open); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Nuova Campagna — Step {createStep}/3", { createStep: String(createStep ?? "") })}</DialogTitle>
          </DialogHeader>

          {createStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("Nome campagna")}</Label>
                <Input
                  maxLength={160}
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder={t("Es. Richiamo lead freddi")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Descrizione (opzionale)")}</Label>
                <Textarea
                  value={form.descrizione}
                  onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
                  placeholder={t("Obiettivo della campagna...")}
                  rows={3}
                  maxLength={2000}
                />
              </div>
            </div>
          )}

          {createStep === 2 && (
            <div className="space-y-4">
              {agentsError && <div role="alert">{t("Impossibile caricare gli agenti.")} <Button variant="outline" onClick={() => reloadAgents()}>{t("Riprova")}</Button></div>}
              {agentsLoading && <p>{t("Caricamento agenti…")}</p>}
              {!agentsLoading && !agentsError && !agents.length && <p className="text-sm text-muted-foreground">{t("Crea prima un agente vocale nella scheda Agenti.")}</p>}
              <div className="space-y-2">
                <Label>{t("Agente AI")}</Label>
                <Select value={form.agent_id} onValueChange={(v) => setForm({ ...form, agent_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("Seleziona agente")} />
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
                <Label>{t("Tipo campagna")}</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chiamata">{t("Chiamate in uscita")}</SelectItem>
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
                    <span className="text-muted-foreground">{t("Nome")}</span>
                    <span className="font-medium">{form.nome}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("Agente")}</span>
                    <span className="font-medium">{agents.find((a) => a.id === form.agent_id)?.nome || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("Tipo")}</span>
                    <span className="font-medium capitalize">{form.tipo.replace("_", " ")}</span>
                  </div>
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground">
                {t("La campagna verrà salvata come bozza, senza effettuare chiamate. Potrai selezionare i destinatari CRM dalla sua scheda. L'avvio massivo resta disabilitato.")}
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            {createStep > 1 && (
              <Button variant="outline" disabled={createMutation.isPending} onClick={() => setCreateStep(createStep - 1)}>{t("Indietro")}</Button>
            )}
            {createStep < 3 ? (
              <Button
                onClick={() => setCreateStep(createStep + 1)}
                disabled={createStep === 1 ? !form.nome.trim() : agentsError || agentsLoading || !agents.some(a => a.id === form.agent_id)}
              >
                {t("Avanti")}
              </Button>
            ) : (
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? t("Creazione...") : t("Crea Campagna")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
