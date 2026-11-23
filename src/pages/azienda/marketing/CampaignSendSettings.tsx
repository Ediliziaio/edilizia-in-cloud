import type { TablesUpdate } from "@/integrations/supabase/types";
import { useState, useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
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

import { Slider } from "@/components/ui/slider";
import { CampaignAbResults } from "@/components/email-marketing/CampaignAbResults";
import { EmailCreditsBanner } from "@/components/email-marketing/EmailCreditsBanner";
import { useEmailMarketingBase } from "@/components/email-marketing/useEmailMarketingBase";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (value: string) => EMAIL_RE.test(value.trim());
const toDatetimeLocal = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
const toIsoOrNull = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const isFutureDatetime = (value: string) => {
  const iso = toIsoOrNull(value);
  return !!iso && new Date(iso).getTime() > Date.now();
};
const hasUnsubscribeToken = (html?: string | null) => /\{\{\s*unsubscribe_url\s*\}\}/.test(html || "");
const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

export default function CampaignSendSettings() {
  const tr = useT();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const emailBase = useEmailMarketingBase();
  const qc = useQueryClient();
  const { effectiveCompany: company, user, role } = useAuth();
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

  // A/B Testing state
  const [abTestEnabled, setAbTestEnabled] = useState(false);
  const [abSubjectB, setAbSubjectB] = useState("");
  const [abSplitPercent, setAbSplitPercent] = useState(50);
  const [abWinnerCriteria, setAbWinnerCriteria] = useState("open_rate");
  const [abTestDurationHours, setAbTestDurationHours] = useState(4);

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaign-send-settings", id],
    enabled: !!id && !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
        .eq("id", id!)
        .eq("company_id", company!.id)
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
        // colonne reali: unsubscribed (globale) + optout_email (canale email)
        .eq("unsubscribed", false)
        .not("optout_email", "is", true)
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
        .from("email_credits")
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
      setScheduledAt(toDatetimeLocal(campaign.scheduled_at));
      setTrackClicks(campaign.track_clicks || false);
      setUtmTracking(campaign.utm_tracking || false);
      setAutoTag(campaign.auto_tag || false);
      setResendToUnopened(campaign.resend_to_unopened || false);
      // A/B Testing
      setAbTestEnabled(campaign.ab_test_enabled || false);
      setAbSubjectB(campaign.ab_subject_b || "");
      setAbSplitPercent((campaign as any).ab_split_percent ?? 50);
      setAbWinnerCriteria((campaign as any).ab_winner_criteria || "open_rate");
      setAbTestDurationHours((campaign as any).ab_test_duration_hours ?? 4);
      // Restore segment settings from DB (Bug 1 fix)
      const seg = campaign.segment_json as any;
      if (seg && typeof seg === "object") {
        setRecipientMode("segment");
        setSegmentTags(Array.isArray(seg.tags) ? seg.tags : []);
        setSegmentSource(seg.source || "");
        setSegmentContactType(seg.contact_type || "");
      } else {
        setRecipientMode("list");
        setSegmentTags([]);
        setSegmentSource("");
        setSegmentContactType("");
      }
    }
  }, [campaign]);

  // Upload attached files to storage
  const uploadFiles = async () => {
    if (!attachedFiles.length || !id) return;
    for (const file of attachedFiles) {
      const path = `${id}/${Date.now()}_${sanitizeFileName(file.name)}`;
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
      if (!company?.id) throw new Error("Azienda non disponibile");
      const payload: TablesUpdate<"email_campaigns"> = {
        sender_name: senderName || null,
        sender_email: senderEmail || null,
        subject,
        preview_text: previewText || null,
        send_mode: sendMode,
        track_clicks: trackClicks,
        utm_tracking: utmTracking,
        auto_tag: autoTag,
        resend_to_unopened: resendToUnopened,
        scheduled_at: sendMode === "scheduled" && scheduledAt ? toIsoOrNull(scheduledAt) : null,
        segment_json: buildSegmentJson(),
        ab_test_enabled: abTestEnabled,
        ab_subject_b: abTestEnabled ? abSubjectB || null : null,
        ab_split_percent: abTestEnabled ? abSplitPercent : 50,
        ab_winner_criteria: abTestEnabled ? abWinnerCriteria : "open_rate",
        ab_test_duration_hours: abTestEnabled ? abTestDurationHours : 4,
      };
      const { error } = await supabase
        .from("email_campaigns")
        .update(payload)
        .eq("id", id!)
        .eq("company_id", company.id);
      if (error) throw error;
      await uploadFiles();
    },
    onSuccess: () => {
      toast.success(tr("Impostazioni salvate"));
      setAttachedFiles([]);
      qc.invalidateQueries({ queryKey: queryKeys.emailCampaigns.all });
      qc.invalidateQueries({ queryKey: ["campaign-editor", id] });
      qc.invalidateQueries({ queryKey: ["campaign-builder", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      if (!company?.id) throw new Error("Azienda non disponibile");
      if (!isValidEmail(senderEmail)) throw new Error("Email del mittente non valida");
      if (customReplyTo && replyToEmail && !isValidEmail(replyToEmail)) throw new Error("Email di risposta non valida");
      if (!subject.trim()) throw new Error("Oggetto obbligatorio");
      if (!campaign?.html_content) throw new Error("Contenuto email obbligatorio");
      if (!hasUnsubscribeToken(campaign.html_content)) throw new Error("Inserisci il link di disiscrizione {{unsubscribe_url}} nel footer prima dell'invio");
      if (recipientCount <= 0) throw new Error("Nessun destinatario valido per questa campagna");
      if (sendMode === "scheduled" && !isFutureDatetime(scheduledAt)) throw new Error("La data di programmazione deve essere futura");
      if (abTestEnabled && !abSubjectB?.trim()) throw new Error("Oggetto variante B obbligatorio per A/B test");

      // Save settings first
      const payload: TablesUpdate<"email_campaigns"> = {
        sender_name: senderName || null,
        sender_email: senderEmail,
        subject,
        preview_text: previewText || null,
        send_mode: sendMode,
        track_clicks: trackClicks,
        utm_tracking: utmTracking,
        auto_tag: autoTag,
        resend_to_unopened: resendToUnopened,
        scheduled_at: sendMode === "scheduled" && scheduledAt ? toIsoOrNull(scheduledAt) : null,
        status: sendMode === "scheduled" ? "scheduled" : campaign?.status === "scheduled" ? "draft" : campaign?.status,
        segment_json: buildSegmentJson(),
        ab_test_enabled: abTestEnabled,
        ab_subject_b: abTestEnabled ? abSubjectB || null : null,
        ab_split_percent: abTestEnabled ? abSplitPercent : 50,
        ab_winner_criteria: abTestEnabled ? abWinnerCriteria : "open_rate",
        ab_test_duration_hours: abTestEnabled ? abTestDurationHours : 4,
      };
      const { error: saveError } = await supabase
        .from("email_campaigns")
        .update(payload)
        .eq("id", id!)
        .eq("company_id", company.id);
      if (saveError) throw saveError;
      await uploadFiles();

      if (sendMode === "scheduled") {
        return { scheduled: true, sent: 0, failed: 0 };
      }

      // Invoke the send-email-campaign edge function
      const { data, error } = await supabase.functions.invoke("send-email-campaign", {
        body: { campaignId: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (role === "super_admin" && user?.id) {
        await supabase.from("admin_audit_log").insert({
          user_id: user.id, action: "send_email_campaign", target_type: "email_campaign",
          target_id: id, details: { campaign_id: id, company_id: company?.id, sent: data?.sent, failed: data?.failed },
        });
      }
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.scheduled) {
        toast.success(tr("Campagna programmata correttamente"));
      } else {
        toast.success(tr("Campagna inviata! {inviate} email inviate, {fallite} fallite.", { inviate: data?.sent || 0, fallite: data?.failed || 0 }));
      }
      qc.invalidateQueries({ queryKey: queryKeys.emailCampaigns.all });
      qc.invalidateQueries({ queryKey: ["email-credits-balance"] });
      navigate(emailBase);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const testEmailMut = useMutation({
    mutationFn: async () => {
      if (!isValidEmail(testEmailAddress)) throw new Error("Inserisci un indirizzo email valido");
      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: { to: testEmailAddress, campaignId: id },
      });
      // Il motivo vero (es. destinatario fuori dall'azienda) sta nel body.
      if (error) throw new Error(await edgeErrorMessage(error, "Invio del test non riuscito"));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success(tr("Email di test inviata!"));
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
    { label: tr("Email mittente valida"), ok: isValidEmail(senderEmail) },
    ...(customReplyTo ? [{ label: tr("Email di risposta valida"), ok: !replyToEmail || isValidEmail(replyToEmail) }] : []),
    { label: tr("Oggetto"), ok: !!subject.trim() },
    { label: tr("Contenuto email"), ok: !!(campaign?.html_content) },
    { label: tr("Link disiscrizione"), ok: hasUnsubscribeToken(campaign?.html_content) },
    { label: tr("Destinatari validi"), ok: recipientCount > 0 },
    ...(sendMode === "scheduled" ? [{ label: tr("Data programmazione futura"), ok: isFutureDatetime(scheduledAt) }] : []),
    ...(abTestEnabled ? [{ label: tr("Oggetto variante B"), ok: !!abSubjectB?.trim() }] : []),
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
        <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={() => navigate(`${emailBase}/campagna/${id}/editor`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {tr("Torna al builder")}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? tr("Salvataggio...") : tr("Salva")}
          </Button>
          {/* disabilitato anche su campagne già inviate/in invio: il server
              rifiuta comunque (409), ma la UI non deve invitare al doppio invio */}
          <Button size="sm" onClick={() => setConfirmSendOpen(true)}
            disabled={sendMut.isPending || missingCount > 0 || ["sending", "sent", "completed"].includes(campaign?.status ?? "")}
            title={["sending", "sent", "completed"].includes(campaign?.status ?? "") ? tr("Campagna già inviata o in invio — duplicala per rispedirla") : undefined}>
            <Send className="h-4 w-4 mr-1" />
            {sendMut.isPending ? tr("Invio...") : campaign?.status === "sent" || campaign?.status === "completed" ? tr("Già inviata") : campaign?.status === "sending" ? tr("In invio…") : tr("Rivedi e invia")}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6 flex flex-col lg:flex-row gap-6">
          {/* Main column */}
          <div className="flex-1 space-y-6">
            {/* Saldo crediti: bloccato (rosso) o in esaurimento (giallo) PRIMA
                di compilare — non solo l'errore al momento dell'invio. */}
            <EmailCreditsBanner warnBelowEur={5} />
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-foreground">{tr("Invia o programma")}</h1>
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
                  <Paperclip className="h-4 w-4 mr-1" /> {tr("Allega file")}
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
                <TabsTrigger value="immediate">{tr("Invia adesso")}</TabsTrigger>
                <TabsTrigger value="scheduled">{tr("Programma")}</TabsTrigger>
                <TabsTrigger value="batch">{tr("Batch")}</TabsTrigger>
                <TabsTrigger value="smart">{tr("Invio intelligente")}</TabsTrigger>
              </TabsList>
            </Tabs>

            {sendMode === "scheduled" && (
              <div className="space-y-2">
                <Label>{tr("Data e ora di invio")}</Label>
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
                <Label>{tr("Nome del mittente")}</Label>
                <Input
                  placeholder={tr("es. La tua azienda")}
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  maxLength={50}
                />
              </div>
              <div className="space-y-2">
                <Label>{tr("Email del mittente *")}</Label>
                <Input
                  type="email"
                  placeholder="noreply@tuodominio.com"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {tr("Usa un'email con dominio verificato per migliorare la deliverability")}
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
                {tr("Imposta indirizzo di risposta personalizzato")}
              </Label>
            </div>

            {customReplyTo && (
              <div className="space-y-2">
                <Label>{tr("Email di risposta")}</Label>
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
              <Label>{tr("Oggetto *")}</Label>
              <Input
                placeholder={tr("L'oggetto della tua email...")}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label>{tr("Testo di anteprima")}</Label>
              <Textarea
                placeholder={tr("Testo che appare dopo l'oggetto nell'inbox...")}
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                rows={2}
                maxLength={500}
              />
            </div>

            <Separator />

            {/* A/B Testing */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{tr("A/B Test")}</p>
                  <p className="text-xs text-muted-foreground">{tr("Testa due varianti di oggetto")}</p>
                </div>
                <Switch checked={abTestEnabled} onCheckedChange={setAbTestEnabled} />
              </div>

              {abTestEnabled && (
                <div className="space-y-4 p-3 rounded-md border bg-muted/30">
                  <div className="space-y-2">
                    <Label className="text-xs">{tr("Oggetto variante A")}</Label>
                    <Input value={subject} disabled className="h-8 text-xs bg-muted/50" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">{tr("Oggetto variante B *")}</Label>
                    <Input
                      placeholder={tr("L'oggetto alternativo...")}
                      value={abSubjectB}
                      onChange={(e) => setAbSubjectB(e.target.value)}
                      maxLength={200}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">{tr("Distribuzione A/B: {abSplitPercent}% / {valore}%", { abSplitPercent: String(abSplitPercent ?? ""), valore: 100 - abSplitPercent })}</Label>
                    <Slider
                      value={[abSplitPercent]}
                      onValueChange={(v) => setAbSplitPercent(v[0])}
                      min={10}
                      max={90}
                      step={5}
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{tr("Variante A: {abSplitPercent}%", { abSplitPercent: String(abSplitPercent ?? "") })}</span>
                      <span>{tr("Variante B: {valore}%", { valore: 100 - abSplitPercent })}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{tr("Criterio vincitore")}</Label>
                      <Select value={abWinnerCriteria} onValueChange={setAbWinnerCriteria}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open_rate">{tr("Tasso apertura")}</SelectItem>
                          <SelectItem value="click_rate">{tr("Tasso click")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{tr("Durata test (ore)")}</Label>
                      <Select value={String(abTestDurationHours)} onValueChange={(v) => setAbTestDurationHours(Number(v))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">{tr("2 ore")}</SelectItem>
                          <SelectItem value="4">{tr("4 ore")}</SelectItem>
                          <SelectItem value="8">{tr("8 ore")}</SelectItem>
                          <SelectItem value="12">{tr("12 ore")}</SelectItem>
                          <SelectItem value="24">{tr("24 ore")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {tr("I destinatari verranno divisi casualmente tra variante A e B. Il confronto dei risultati sarà visibile nei log della campagna.")}
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Recipients */}
            <div className="space-y-3">
              <Label className="text-base font-medium">{tr("Destinatari")}</Label>
              <div className="space-y-2">
                {[
                  { value: "list", label: tr("Invia a tutti i contatti iscritti") },
                  { value: "segment", label: tr("Filtra per segmento") },
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
                    <Label className="text-xs">{tr("Filtra per tag")}</Label>
                    <Input
                      placeholder={tr("Inserisci tag separati da virgola...")}
                      value={segmentTags.join(", ")}
                      onChange={(e) => setSegmentTags(e.target.value.split(",").map(t => t.trim()).filter(Boolean))}
                    />
                    <p className="text-[10px] text-muted-foreground">{tr("Solo contatti che hanno almeno uno di questi tag")}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tr("Filtra per sorgente")}</Label>
                    <Select value={segmentSource || "all"} onValueChange={(v) => setSegmentSource(v === "all" ? "" : v)}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={tr("Qualsiasi sorgente")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{tr("Qualsiasi")}</SelectItem>
                        <SelectItem value="meta">Meta</SelectItem>
                        <SelectItem value="google">Google</SelectItem>
                        <SelectItem value="website">{tr("Sito web")}</SelectItem>
                        <SelectItem value="manual">{tr("Manuale")}</SelectItem>
                        <SelectItem value="import">{tr("Importato")}</SelectItem>
                        <SelectItem value="referral">{tr("Referral")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tr("Filtra per tipo contatto")}</Label>
                    <Select value={segmentContactType || "all"} onValueChange={(v) => setSegmentContactType(v === "all" ? "" : v)}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={tr("Qualsiasi tipo")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{tr("Qualsiasi")}</SelectItem>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="prospect">{tr("Prospect")}</SelectItem>
                        <SelectItem value="customer">{tr("Cliente")}</SelectItem>
                        <SelectItem value="lost">{tr("Perso")}</SelectItem>
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
                  <span className="font-medium">{tr("Impostazioni aggiuntive")}</span>
                  {additionalOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{tr("Traccia clic sui link")}</p>
                    <p className="text-xs text-muted-foreground">{tr("Monitora quali link vengono cliccati")}</p>
                  </div>
                  <Switch checked={trackClicks} onCheckedChange={setTrackClicks} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{tr("Tracciamento UTM")}</p>
                    <p className="text-xs text-muted-foreground">{tr("Aggiungi parametri UTM ai link")}</p>
                  </div>
                  <Switch checked={utmTracking} onCheckedChange={setUtmTracking} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{tr("Aggiungi etichette automatiche")}</p>
                    <p className="text-xs text-muted-foreground">{tr("Tagga i contatti che interagiscono")}</p>
                  </div>
                  <Switch checked={autoTag} onCheckedChange={setAutoTag} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{tr("Rinvia a chi non ha aperto")}</p>
                    <p className="text-xs text-muted-foreground">{tr("Invia nuovamente dopo 48h a chi non ha aperto")}</p>
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
                  {tr("💳 Saldo Crediti Email")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">€{(creditsData?.balance_eur ?? 0).toFixed(2)}</p>
                {/* BUGFIX: prima si confrontava n° email con il saldo in EURO
                    (1 email = 1 €!) → falsi "crediti insufficienti". Il gate
                    reale è lato server al momento dell'invio. */}
                <p className="text-xs text-muted-foreground">{tr("Invio previsto a ~{recipientCount} destinatari · il costo viene scalato dal saldo al momento dell'invio", { recipientCount: String(recipientCount ?? "") })}</p>
                {(creditsData?.balance_eur ?? 0) <= 0 && recipientCount > 0 && (
                  <p className="text-xs text-destructive mt-1 font-medium">
                    {tr("⚠️ Saldo crediti esaurito: ricarica prima di inviare")}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Recipient count */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" /> {tr("Destinatari stimati")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{recipientCount.toLocaleString(intlCampo())}</p>
                <p className="text-xs text-muted-foreground">{tr("contatti iscritti con email")}</p>
              </CardContent>
            </Card>

            {/* Spam score */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{tr("Punteggio spam")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className={`text-3xl font-bold ${spamColor}`}>{spamScore}</div>
                  <div className="text-xs text-muted-foreground">
                    {spamScore < 30 ? tr("Ottimo! Bassa probabilità di finire in spam") :
                     spamScore < 60 ? tr("Discreto, ma ci sono margini di miglioramento") :
                     tr("Alto rischio spam, rivedi il contenuto")}
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
                  <Eye className="h-4 w-4 mr-2" /> {tr("Anteprima nel browser")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    setTestEmailAddress((attuale) => attuale || user?.email || "");
                    setTestEmailOpen(true);
                  }}
                >
                  <Mail className="h-4 w-4 mr-2" /> {tr("Invia email di test")}
                </Button>
              </CardContent>
            </Card>

            {/* A/B Results */}
            {id && <CampaignAbResults campaignId={id} />}

            {/* Email preview */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{tr("Anteprima email")}</CardTitle>
              </CardHeader>
              <CardContent>
                {campaign?.html_content ? (
                  <div
                    className="border rounded-md p-3 text-xs max-h-64 overflow-auto bg-background"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(campaign.html_content) }}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-6">{tr("Nessun contenuto")}</p>
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
                      {missingCount} {missingCount === 1 ? tr("campo obbligatorio mancante") : tr("campi obbligatori mancanti")}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      {tr("Tutti i campi compilati")}
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
              {sendMode === "scheduled" ? tr("Conferma programmazione") : tr("Conferma invio")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{tr("Stai per")} {sendMode === "scheduled" ? tr("programmare") : tr("inviare")} {tr("la campagna con i seguenti parametri:")}</p>
                <div className="bg-muted rounded-md p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tr("Oggetto:")}</span>
                    <span className="font-medium text-foreground">{subject || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tr("Mittente:")}</span>
                    <span className="font-medium text-foreground">{senderName ? `${senderName} <${senderEmail}>` : senderEmail || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tr("Destinatari:")}</span>
                    <span className="font-medium text-foreground">{tr("~{recipientCount} contatti", { recipientCount: recipientCount.toLocaleString(intlCampo()) })}</span>
                  </div>
                  {sendMode === "scheduled" && scheduledAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{tr("Data invio:")}</span>
                      <span className="font-medium text-foreground">{new Date(scheduledAt).toLocaleString(intlCampo())}</span>
                    </div>
                  )}
                  {attachedFiles.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{tr("Allegati:")}</span>
                      <span className="font-medium text-foreground">{tr("{n} file", { n: attachedFiles.length })}</span>
                    </div>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Annulla")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => sendMut.mutate()} disabled={sendMut.isPending}>
              {sendMut.isPending ? tr("Invio...") : sendMode === "scheduled" ? tr("Programma") : tr("Invia adesso")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Browser preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{tr("Anteprima email")}</span>
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
                  {tr("Nessun contenuto HTML disponibile")}
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
            <DialogTitle>{tr("Invia email di test")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>{tr("Indirizzo email destinatario")}</Label>
            <Input
              type="email"
              placeholder="test@esempio.com"
              value={testEmailAddress}
              onChange={(e) => setTestEmailAddress(e.target.value)}
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              {tr("L'email verrà inviata con oggetto prefissato [TEST], al tuo indirizzo o a quello di un collega dell'azienda.")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestEmailOpen(false)}>
              {tr("Annulla")}
            </Button>
            <Button
              onClick={() => testEmailMut.mutate()}
              disabled={testEmailMut.isPending || !isValidEmail(testEmailAddress)}
            >
              {testEmailMut.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" /> {tr("Invio...")}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1" /> {tr("Invia test")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
