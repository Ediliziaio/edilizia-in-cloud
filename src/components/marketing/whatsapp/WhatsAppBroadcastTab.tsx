import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Send, Users, FileText, Eye, Clock, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export function WhatsAppBroadcastTab() {
  const [segment, setSegment] = useState("tutti");
  const [templateName, setTemplateName] = useState("");
  const [messageText, setMessageText] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const handleSend = () => {
    if (!templateName.trim()) {
      toast.error("Inserisci il nome del template WhatsApp");
      return;
    }
    if (!messageText.trim()) {
      toast.error("Inserisci il testo del messaggio");
      return;
    }
    toast.info("Funzionalità in arrivo", {
      description: "L'invio broadcast sarà disponibile con l'integrazione WhatsApp Business API.",
    });
  };

  const variabili = ["{{nome}}", "{{cognome}}", "{{email}}", "{{telefono}}", "{{azienda}}"];

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

            <div className="space-y-2">
              <Label>Nome Template WhatsApp</Label>
              <Input
                placeholder="es. promo_estate_2025"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Il template deve essere pre-approvato da Meta nella console WhatsApp Business.
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
              <Button className="gap-2" onClick={handleSend}>
                <Send className="h-4 w-4" />
                Invia Broadcast
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
              <div className="bg-[#e5ddd5] dark:bg-muted rounded-lg p-4 max-w-sm">
                <div className="bg-[#dcf8c6] dark:bg-primary/20 rounded-lg p-3 text-sm shadow-sm">
                  {messageText
                    .replace("{{nome}}", "Mario")
                    .replace("{{cognome}}", "Rossi")
                    .replace("{{email}}", "mario@email.com")
                    .replace("{{telefono}}", "+39 333 1234567")
                    .replace("{{azienda}}", "Rossi Costruzioni")}
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
            <div className="text-center py-8 text-muted-foreground">
              <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nessun broadcast inviato</p>
              <p className="text-xs mt-1">I broadcast inviati appariranno qui</p>
            </div>
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
            <p>Puoi creare e gestire i template dalla <strong>Console WhatsApp Business</strong>.</p>
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
