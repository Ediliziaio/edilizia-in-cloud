import { useState, useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  Send,
  Paperclip,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Eye,
  Mail,
  CheckCircle2,
  Loader2,
  Users,
  X,
  Monitor,
  Smartphone,
} from "lucide-react";

export default function CampaignSendSettings() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { effectiveCompany: company } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [sendMode, setSendMode] = useState("immediate");
  const [scheduledAt, setScheduledAt] = useState("");
  const [trackClicks, setTrackClicks] = useState(false);
  const [utmTracking, setUtmTracking] = useState(false);
  const [autoTag, setAutoTag] = useState(false);
  const [resendToUnopened, setResendToUnopened] = useState(false);
  const [customReplyTo, setCustomReplyTo] = useState(false);
  const [replyToEmail, setReplyToEmail] = useState("");
  const [recipientMode, setRecipientMode] = useState("list");
  const [segmentTags, setSegmentTags] = useState<string[]>([]);
  const [segmentSource, setSegmentSource] = useState("");
  const [segmentContactType, setSegmentContactType] = useState("");
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  // New state for 3 features
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [testEmailOpen, setTestEmailOpen] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState("");

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaign-send-settings", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: recipientCount = 0 } = useQuery({
    queryKey: ["recipient-count", company?.id, recipientMode, segmentTags, segmentSource, segmentContactType],
    enabled: !!company?.id,
    queryFn: async () => {
      let query = (supabase
        .from("marketing_contacts")
        .select("id", { count: "exact", head: true }) as any)
        .eq("company_id", company!.id)
        .eq("email_unsubscribed", false)
        .not("email", "is", null);

      if (recipientMode === "segment") {
        if (segmentTags.length > 0) query = query.overlaps("tags", segmentTags);
        if (segmentSource) query = query.eq("source", segmentSource);
        if (segmentContactType) query = query.eq("contact_type", segmentContactType);
      }

      const { count } = await query;
      return count || 0;
    },
  });

  // Email credits balance
  const { data: creditsData } = useQuery({
    queryKey: ["email-credits-balance", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await (supabase
        .from("email_credits" as any)
        .select("balance_eur, total_spent_eur") as any)
        .eq("company_id", company!.id)
        .maybeSingle();
      return data as { balance_eur: number; total_spent_eur: number } | null;
    },
  });

  useEffect(() => {
    if (campaign) {
      setSenderName(campaign.sender_name || "");
      setSenderEmail(campaign.sender_email || "");
      setSubject(campaign.subject || "");
      setPreviewText(campaign.preview_text || "");
      setSendMode(campaign.send_mode || "immediate");
      setScheduledAt(campaign.scheduled_at || "");
      setTrackClicks(campaign.track_clicks || false);
      setUtmTracking(campaign.utm_tracking || false);
      setAutoTag(campaign.auto_tag || false);
      setResendToUnopened(campaign.resend_to_unopened || false);
    }
  }, [campaign]);

  // Upload attached files to storage
  const uploadFiles = async () => {
    if (!attachedFiles.length || !id) return;
    for (const file of attachedFiles) {
      const path = `${id}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage
        .from("campaign-attachments")
        .upload(path, file);
      if (error) throw new Error(`Upload fallito: ${file.name}`);
    }
  };

  const buildSegmentJson = () => {
    if (recipientMode !== "segment") return null;
    return {
      tags: segmentTags.length > 0 ? segmentTags : undefined,
      source: segmentSource || undefined,
      contact_type: segmentContactType || undefined,
    };
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = {
        sender_name: senderName || null,
        sender_email: senderEmail || null,
        subject,
        preview_text: previewText || null,
        send_mode: sendMode,
        track_clicks: trackClicks,
        utm_tracking: utmTracking,
        auto_tag: autoTag,
        resend_to_unopened: resendToUnopened,
        scheduled_at: sendMode === "scheduled" && scheduledAt ? scheduledAt : null,
        segment_json: buildSegmentJson(),
      };
      const { error } = await supabase
        .from("email_campaigns")
        .update(payload)
        .eq("id", id!);
      if (error) throw error;
      await uploadFiles();
    },
    onSuccess: () => {
      toast.success("Impostazioni salvate");
      setAttachedFiles([]);
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      if (!senderEmail) throw new Error("Email del mittente obbligatoria");
      if (!subject) throw new Error("Oggetto obbligatorio");

      // Save settings first
      const payload: Record<string, any> = {
        sender_name: senderName || null,
        sender_email: senderEmail,
        subject,
        preview_text: previewText || null,
        send_mode: sendMode,
        track_clicks: trackClicks,
        utm_tracking: utmTracking,
        auto_tag: autoTag,
        resend_to_unopened: resendToUnopened,
        scheduled_at: sendMode === "scheduled" && scheduledAt ? scheduledAt : null,
        segment_json: buildSegmentJson(),
      };
      const { error: saveError } = await supabase
        .from("email_campaigns")
        .update(payload)
        .eq("id", id!);
      if (saveError) throw saveError;
      await uploadFiles();

      // Invoke the send-email-campaign edge function
      const { data, error } = await supabase.functions.invoke("send-email-campaign", {
        body: { campaignId: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Campagna inviata! ${data?.sent || 0} email inviate, ${data?.failed || 0} fallite.`);
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      qc.invalidateQueries({ queryKey: ["email-credits-balance"] });
      navigate("/azienda/marketing/email");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const testEmailMut = useMutation({
    mutationFn: async () => {
      if (!testEmailAddress) throw new Error("Inserisci un indirizzo email");
      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: { to: testEmailAddress, campaignId: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Email di test inviata!");
      setTestEmailOpen(false);
      setTestEmailAddress("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachedFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const requiredFields = [
    { label: "Email mittente", ok: !!senderEmail },
    { label: "Oggetto", ok: !!subject },
    { label: "Contenuto email", ok: !!(campaign?.html_content) },
  ];
  const missingCount = requiredFields.filter((f) => !f.ok).length;

  const spamScore = Math.max(0, Math.min(100, 15 + (subject.length > 50 ? 10 : 0) + (!previewText ? 5 : 0)));
  const spamColor = spamScore < 30 ? "text-green-500" : spamScore < 60 ? "text-yellow-500" : "text-red-500";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-muted/30">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-background border-b shrink-0">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/azienda/marketing/email/campagna/${id}/editor`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Torna al builder
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Salvataggio..." : "Salva"}
          </Button>
          <Button size="sm" onClick={() => setConfirmSendOpen(true)} disabled={sendMut.isPending || missingCount > 0}>
            <Send className="h-4 w-4 mr-1" />
            {sendMut.isPending ? "Invio..." : "Rivedi e invia"}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6 flex flex-col lg:flex-row gap-6">
          {/* Main column */}
          <div className="flex-1 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-foreground">Invia o programma</h1>
                <p className="text-sm text-muted-foreground">{campaign?.name}</p>
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.xlsx"
                  multiple
                  className="hidden"
                  onChange={handleFilesSelected}
                />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-4 w-4 mr-1" /> Allega file
                </Button>
              </div>
            </div>

            {/* Attached files chips */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachedFiles.map((file, i) => (
                  <span
                    key={`${file.name}-${i}`}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs text-foreground"
                  >
                    <Paperclip className="h-3 w-3" />
                    {file.name}
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="ml-1 rounded-full hover:bg-destructive/20 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Send mode tabs */}
            <Tabs value={sendMode} onValueChange={setSendMode}>
              <TabsList className="w-full justify-start">
                <TabsTrigger value="immediate">Invia adesso</TabsTrigger>
                <TabsTrigger value="scheduled">Programma</TabsTrigger>
                <TabsTrigger value="batch">Batch</TabsTrigger>
                <TabsTrigger value="smart">Invio intelligente</TabsTrigger>
              </TabsList>
            </Tabs>

            {sendMode === "scheduled" && (
              <div className="space-y-2">
                <Label>Data e ora di invio</Label>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
            )}

            <Separator />

            {/* Sender info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome del mittente</Label>
                <Input
                  placeholder="es. La tua azienda"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  maxLength={50}
                />
              </div>
              <div className="space-y-2">
                <Label>Email del mittente *</Label>
                <Input
                  type="email"
                  placeholder="noreply@tuodominio.com"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Usa un'email con dominio verificato per migliorare la deliverability
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="custom-reply"
                checked={customReplyTo}
                onCheckedChange={(v) => setCustomReplyTo(!!v)}
              />
              <Label htmlFor="custom-reply" className="text-sm cursor-pointer">
                Imposta indirizzo di risposta personalizzato
              </Label>
            </div>

            {customReplyTo && (
              <div className="space-y-2">
                <Label>Email di risposta</Label>
                <Input
                  type="email"
                  placeholder="risposte@tuodominio.com"
                  value={replyToEmail}
                  onChange={(e) => setReplyToEmail(e.target.value)}
                />
              </div>
            )}

            <Separator />

            {/* Subject */}
            <div className="space-y-2">
              <Label>Oggetto *</Label>
              <Input
                placeholder="L'oggetto della tua email..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label>Testo di anteprima</Label>
              <Textarea
                placeholder="Testo che appare dopo l'oggetto nell'inbox..."
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                rows={2}
                maxLength={500}
              />
            </div>

            <Separator />

            {/* Recipients */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Destinatari</Label>
              <div className="space-y-2">
                {[
                  { value: "list", label: "Invia a tutti i contatti iscritti" },
                  { value: "segment", label: "Filtra per segmento" },
                ].map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="recipient-mode"
                      value={opt.value}
                      checked={recipientMode === opt.value}
                      onChange={(e) => setRecipientMode(e.target.value)}
                      className="accent-primary"
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>

              {recipientMode === "segment" && (
                <div className="space-y-3 p-3 rounded-md border bg-muted/30">
                  <div className="space-y-1">
                    <Label className="text-xs">Filtra per tag</Label>
                    <Input
                      placeholder="Inserisci tag separati da virgola..."
                      value={segmentTags.join(", ")}
                      onChange={(e) => setSegmentTags(e.target.value.split(",").map(t => t.trim()).filter(Boolean))}
                    />
                    <p className="text-[10px] text-muted-foreground">Solo contatti che hanno almeno uno di questi tag</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Filtra per sorgente</Label>
                    <Select value={segmentSource} onValueChange={setSegmentSource}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Qualsiasi sorgente" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Qualsiasi</SelectItem>
                        <SelectItem value="meta">Meta</SelectItem>
                        <SelectItem value="google">Google</SelectItem>
                        <SelectItem value="website">Sito web</SelectItem>
                        <SelectItem value="manual">Manuale</SelectItem>
                        <SelectItem value="import">Importato</SelectItem>
                        <SelectItem value="referral">Referral</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Filtra per tipo contatto</Label>
                    <Select value={segmentContactType} onValueChange={setSegmentContactType}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Qualsiasi tipo" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Qualsiasi</SelectItem>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="prospect">Prospect</SelectItem>
                        <SelectItem value="customer">Cliente</SelectItem>
                        <SelectItem value="lost">Perso</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Additional settings */}
            <Collapsible open={additionalOpen} onOpenChange={setAdditionalOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between px-0">
                  <span className="font-medium">Impostazioni aggiuntive</span>
                  {additionalOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Traccia clic sui link</p>
                    <p className="text-xs text-muted-foreground">Monitora quali link vengono cliccati</p>
                  </div>
                  <Switch checked={trackClicks} onCheckedChange={setTrackClicks} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Tracciamento UTM</p>
                    <p className="text-xs text-muted-foreground">Aggiungi parametri UTM ai link</p>
                  </div>
                  <Switch checked={utmTracking} onCheckedChange={setUtmTracking} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Aggiungi etichette automatiche</p>
                    <p className="text-xs text-muted-foreground">Tagga i contatti che interagiscono</p>
                  </div>
                  <Switch checked={autoTag} onCheckedChange={setAutoTag} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Rinvia a chi non ha aperto</p>
                    <p className="text-xs text-muted-foreground">Invia nuovamente dopo 48h a chi non ha aperto</p>
                  </div>
                  <Switch checked={resendToUnopened} onCheckedChange={setResendToUnopened} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-80 space-y-4 shrink-0">
            {/* Credits balance */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  💳 Saldo Crediti Email
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">€{(creditsData?.balance_eur ?? 0).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">
                  Stima invio: ~{recipientCount} crediti necessari
                </p>
                {recipientCount > (creditsData?.balance_eur ?? 0) && (
                  <p className="text-xs text-destructive mt-1 font-medium">
                    ⚠️ Crediti insufficienti per l'invio completo
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Recipient count */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" /> Destinatari stimati
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{recipientCount.toLocaleString("it-IT")}</p>
                <p className="text-xs text-muted-foreground">contatti iscritti con email</p>
              </CardContent>
            </Card>

            {/* Spam score */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Punteggio spam</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className={`text-3xl font-bold ${spamColor}`}>{spamScore}</div>
                  <div className="text-xs text-muted-foreground">
                    {spamScore < 30 ? "Ottimo! Bassa probabilità di finire in spam" :
                     spamScore < 60 ? "Discreto, ma ci sono margini di miglioramento" :
                     "Alto rischio spam, rivedi il contenuto"}
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2 mt-3">
                  <div
                    className={`h-2 rounded-full transition-all ${spamScore < 30 ? "bg-green-500" : spamScore < 60 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${spamScore}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Quick actions */}
            <Card>
              <CardContent className="pt-4 space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setPreviewOpen(true)}
                >
                  <Eye className="h-4 w-4 mr-2" /> Anteprima nel browser
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setTestEmailOpen(true)}
                >
                  <Mail className="h-4 w-4 mr-2" /> Invia email di test
                </Button>
              </CardContent>
            </Card>

            {/* Email preview */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Anteprima email</CardTitle>
              </CardHeader>
              <CardContent>
                {campaign?.html_content ? (
                  <div
                    className="border rounded-md p-3 text-xs max-h-64 overflow-auto bg-background"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(campaign.html_content) }}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-6">Nessun contenuto</p>
                )}
              </CardContent>
            </Card>

            {/* Required fields */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  {missingCount > 0 ? (
                    <>
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      {missingCount} {missingCount === 1 ? "campo obbligatorio mancante" : "campi obbligatori mancanti"}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Tutti i campi compilati
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {requiredFields.map((f) => (
                  <div key={f.label} className="flex items-center gap-2 text-xs">
                    {f.ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                    )}
                    <span className={f.ok ? "text-muted-foreground" : "text-foreground font-medium"}>{f.label}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Send confirmation dialog */}
      <AlertDialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {sendMode === "scheduled" ? "Conferma programmazione" : "Conferma invio"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Stai per {sendMode === "scheduled" ? "programmare" : "inviare"} la campagna con i seguenti parametri:</p>
                <div className="bg-muted rounded-md p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Oggetto:</span>
                    <span className="font-medium text-foreground">{subject || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mittente:</span>
                    <span className="font-medium text-foreground">{senderName ? `${senderName} <${senderEmail}>` : senderEmail || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Destinatari:</span>
                    <span className="font-medium text-foreground">~{recipientCount.toLocaleString("it-IT")} contatti</span>
                  </div>
                  {sendMode === "scheduled" && scheduledAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Data invio:</span>
                      <span className="font-medium text-foreground">{new Date(scheduledAt).toLocaleString("it-IT")}</span>
                    </div>
                  )}
                  {attachedFiles.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Allegati:</span>
                      <span className="font-medium text-foreground">{attachedFiles.length} file</span>
                    </div>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => sendMut.mutate()} disabled={sendMut.isPending}>
              {sendMut.isPending ? "Invio..." : sendMode === "scheduled" ? "Programma" : "Invia adesso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Browser preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Anteprima email</span>
              <div className="flex gap-1">
                <Button
                  variant={previewDevice === "desktop" ? "default" : "outline"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPreviewDevice("desktop")}
                >
                  <Monitor className="h-4 w-4" />
                </Button>
                <Button
                  variant={previewDevice === "mobile" ? "default" : "outline"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPreviewDevice("mobile")}
                >
                  <Smartphone className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex justify-center bg-muted/50 rounded-md p-4">
            <div
              className="bg-background border rounded-md overflow-auto"
              style={{
                width: previewDevice === "mobile" ? "375px" : "100%",
                maxWidth: "100%",
                minHeight: "400px",
              }}
            >
              {campaign?.html_content ? (
                <div
                  className="p-4"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(campaign.html_content) }}
                />
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  Nessun contenuto HTML disponibile
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test email dialog */}
      <Dialog open={testEmailOpen} onOpenChange={setTestEmailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invia email di test</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Indirizzo email destinatario</Label>
            <Input
              type="email"
              placeholder="test@esempio.com"
              value={testEmailAddress}
              onChange={(e) => setTestEmailAddress(e.target.value)}
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              L'email verrà inviata con oggetto prefissato [TEST]
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestEmailOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={() => testEmailMut.mutate()}
              disabled={testEmailMut.isPending || !testEmailAddress}
            >
              {testEmailMut.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Invio...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1" /> Invia test
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
