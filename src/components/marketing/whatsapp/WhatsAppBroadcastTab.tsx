import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, Users, FileText, Eye, Clock, MessageCircle, Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export function WhatsAppBroadcastTab() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [segment, setSegment] = useState("tutti");
  const [segmentTag, setSegmentTag] = useState("");
  const [segmentSource, setSegmentSource] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [messageText, setMessageText] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const companyId = effectiveCompany?.id;

  // Fetch broadcast history
  const { data: broadcasts, isLoading: loadingHistory } = useQuery({
    queryKey: ["whatsapp-broadcasts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_broadcasts" as any)
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-broadcast", {
        body: {
          company_id: companyId,
          segment,
          segment_config: {
            ...(segment === "tag" && segmentTag ? { tag: segmentTag } : {}),
            ...(segment === "source" && segmentSource ? { source: segmentSource } : {}),
          },
          template_name: templateName.trim(),
          message_text: messageText.trim(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success("Broadcast completato", {
        description: `${data.sent} inviati, ${data.failed} falliti su ${data.total_contacts} contatti`,
      });
      setTemplateName("");
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-broadcasts", companyId] });
    },
    onError: (err: any) => {
      toast.error("Errore broadcast", { description: err.message });
    },
  });

  const handleSend = () => {
    if (!templateName.trim()) {
      toast.error("Inserisci il nome del template WhatsApp");
      return;
    }
    if (!messageText.trim()) {
      toast.error("Inserisci il testo del messaggio");
      return;
    }
    sendMutation.mutate();
  };

  const variabili = ["{{nome}}", "{{cognome}}", "{{email}}", "{{telefono}}", "{{azienda}}"];

  const statusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0 gap-1"><CheckCircle className="h-3 w-3" /> Completato</Badge>;
      case "sending":
        return <Badge variant="outline" className="gap-1 text-amber-600"><Loader2 className="h-3 w-3 animate-spin" /> In corso</Badge>;
      case "failed":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Fallito</Badge>;
      default:
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> {status}</Badge>;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Form */}
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Nuovo Broadcast
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Segmento contatti</Label>
              <Select value={segment} onValueChange={setSegment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tutti">Tutti i contatti</SelectItem>
                  <SelectItem value="tag">Per tag</SelectItem>
                  <SelectItem value="source">Per fonte</SelectItem>
                  <SelectItem value="pipeline">Per fase pipeline</SelectItem>
                  <SelectItem value="lead_caldi">Lead caldi</SelectItem>
                  <SelectItem value="nuovi">Nuovi contatti (ultimi 7 giorni)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {segment === "tag" && (
              <div className="space-y-2">
                <Label>Tag</Label>
                <Input
                  placeholder="es. hot, vip, evento2025"
                  value={segmentTag}
                  onChange={(e) => setSegmentTag(e.target.value)}
                />
              </div>
            )}

            {segment === "source" && (
              <div className="space-y-2">
                <Label>Fonte</Label>
                <Input
                  placeholder="es. facebook, google, referral"
                  value={segmentSource}
                  onChange={(e) => setSegmentSource(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Nome Template WhatsApp</Label>
              <Input
                placeholder="es. promo_estate_2025"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Il template deve essere pre-approvato da Meta. Vai alla tab "Template" per gestirli.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Testo del messaggio</Label>
              <Textarea
                placeholder="Ciao {{nome}}, abbiamo una promozione speciale per te..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={5}
              />
              <div className="flex flex-wrap gap-1.5">
                {variabili.map((v) => (
                  <Badge
                    key={v}
                    variant="outline"
                    className="cursor-pointer hover:bg-accent text-xs"
                    onClick={() => setMessageText((prev) => prev + " " + v)}
                  >
                    {v}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="gap-2" onClick={() => setShowPreview(!showPreview)}>
                <Eye className="h-4 w-4" />
                {showPreview ? "Nascondi anteprima" : "Anteprima"}
              </Button>
              <Button
                className="gap-2"
                onClick={handleSend}
                disabled={sendMutation.isPending}
              >
                {sendMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sendMutation.isPending ? "Invio in corso..." : "Invia Broadcast"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        {showPreview && messageText && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Anteprima messaggio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted rounded-lg p-4 max-w-sm">
                <div className="bg-primary/10 rounded-lg p-3 text-sm shadow-sm">
                  {messageText
                    .replace(/\{\{nome\}\}/g, "Mario")
                    .replace(/\{\{cognome\}\}/g, "Rossi")
                    .replace(/\{\{email\}\}/g, "mario@email.com")
                    .replace(/\{\{telefono\}\}/g, "+39 333 1234567")
                    .replace(/\{\{azienda\}\}/g, "Rossi Costruzioni")}
                  <div className="text-[10px] text-muted-foreground text-right mt-1">14:30 ✓✓</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Storico */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Storico Broadcast
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="space-y-3">
                {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : !broadcasts?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Nessun broadcast inviato</p>
                <p className="text-xs mt-1">I broadcast inviati appariranno qui</p>
              </div>
            ) : (
              <div className="space-y-3">
                {broadcasts.map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between border rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-medium">{b.template_name}</span>
                        {statusBadge(b.status)}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{b.segment}</span>
                        <span>•</span>
                        <span>{b.total_contacts} contatti</span>
                        <span>•</span>
                        <span className="text-emerald-600">{b.sent_count} inviati</span>
                        {b.failed_count > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-destructive">{b.failed_count} falliti</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(b.created_at), "dd MMM HH:mm", { locale: it })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sidebar info */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Template WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-2">
            <p>I template devono essere approvati da Meta prima di poter essere usati per i broadcast.</p>
            <p>Vai alla tab <strong>"Template"</strong> per creare e gestire i tuoi template.</p>
            <p>Variabili supportate: nome, cognome, email, telefono, azienda.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Limiti & Best Practice</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-2">
            <p>• Massimo 1.000 messaggi/giorno per numeri nuovi</p>
            <p>• I contatti devono aver dato consenso (opt-in)</p>
            <p>• Usa template approvati per evitare blocchi</p>
            <p>• Monitora il Quality Rating del numero</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
