import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";

export default function CampaignSendSettings() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

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
  const [additionalOpen, setAdditionalOpen] = useState(false);

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
      };
      const { error } = await supabase
        .from("email_campaigns")
        .update(payload)
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Impostazioni salvate");
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      // Validate required fields
      if (!senderEmail) throw new Error("Email del mittente obbligatoria");
      if (!subject) throw new Error("Oggetto obbligatorio");

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
        status: sendMode === "scheduled" ? "scheduled" : "sending",
        scheduled_at: sendMode === "scheduled" && scheduledAt ? scheduledAt : null,
        sent_at: sendMode === "immediate" ? new Date().toISOString() : null,
      };
      const { error } = await supabase
        .from("email_campaigns")
        .update(payload)
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(sendMode === "scheduled" ? "Campagna programmata!" : "Campagna in invio!");
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      navigate("/azienda/marketing/email");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Calculate required fields status
  const requiredFields = [
    { label: "Email mittente", ok: !!senderEmail },
    { label: "Oggetto", ok: !!subject },
    { label: "Contenuto email", ok: !!(campaign?.html_content) },
  ];
  const missingCount = requiredFields.filter((f) => !f.ok).length;

  // Spam score mock (0-100, lower is better)
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
          <Button size="sm" onClick={() => sendMut.mutate()} disabled={sendMut.isPending || missingCount > 0}>
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
              <Button variant="outline" size="sm">
                <Paperclip className="h-4 w-4 mr-1" /> Allega file
              </Button>
            </div>

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
              />
            </div>

            <div className="space-y-2">
              <Label>Testo di anteprima</Label>
              <Textarea
                placeholder="Testo che appare dopo l'oggetto nell'inbox..."
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                rows={2}
              />
            </div>

            <Separator />

            {/* Recipients */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Destinatari</Label>
              <div className="space-y-2">
                {[
                  { value: "list", label: "Invia all'elenco" },
                  { value: "contacts", label: "Scegli contatti" },
                  { value: "segment", label: "Segmenti predefiniti" },
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
              <p className="text-xs text-muted-foreground">
                La selezione dettagliata dei destinatari sarà disponibile dopo l'integrazione con il servizio email.
              </p>
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
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => toast.info("Funzionalità in arrivo")}>
                  <Eye className="h-4 w-4 mr-2" /> Anteprima nel browser
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => toast.info("Funzionalità in arrivo")}>
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
                    dangerouslySetInnerHTML={{ __html: campaign.html_content }}
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
    </div>
  );
}
