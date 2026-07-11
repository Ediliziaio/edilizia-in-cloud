import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  Send,
  CheckCircle2,
  XCircle,
  Trash2,
  Loader2,
} from "lucide-react";
import { useEmailTest, type EmailTemplate, type EmailTestResult } from "@/hooks/useEmailTest";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { format } from "date-fns";

const TEMPLATE_LABELS: Record<EmailTemplate, string> = {
  plain: "Testo libero",
  welcome: "Email di benvenuto",
  notification: "Notifica sistema",
};

const DEFAULT_SUBJECTS: Record<EmailTemplate, string> = {
  plain: "[TEST] Email di prova",
  welcome: "[TEST] Benvenuto in Edilizia in Cloud",
  notification: "[TEST] Notifica dalla piattaforma",
};

function HistoryRow({ result }: { result: EmailTestResult }) {
  const timeAgo = formatDistanceToNow(new Date(result.sentAt), {
    addSuffix: true,
    locale: it,
  });
  const timeFormatted = format(new Date(result.sentAt), "HH:mm:ss", { locale: it });

  return (
    <div className="flex items-center gap-3 py-2 px-3 text-sm border-b last:border-0">
      {result.success ? (
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-destructive shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-xs truncate">{result.to}</span>
          <Badge variant="outline" className="text-xs">
            {TEMPLATE_LABELS[result.template]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate">{result.subject}</p>
        {result.error && (
          <p className="text-xs text-destructive truncate">{result.error}</p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-mono">{timeFormatted}</p>
        <p className="text-xs text-muted-foreground">{timeAgo}</p>
      </div>
    </div>
  );
}

// Validazione leggera lato client: evita invii a indirizzi palesemente
// malformati (il controllo vero resta al provider).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function EmailTestPanel() {
  const { sendEmail, isSending, history, clearHistory } = useEmailTest();

  const [to, setTo] = useState("");
  const [template, setTemplate] = useState<EmailTemplate>("plain");
  const [subject, setSubject] = useState(DEFAULT_SUBJECTS.plain);
  const [body, setBody] = useState("");

  const toTrimmed = to.trim();
  const toIsValid = EMAIL_RE.test(toTrimmed);
  const showToError = toTrimmed.length > 0 && !toIsValid;

  // FIX: standardizza reset su template change — prima il body veniva resettato
  // solo per non-plain ma il subject cambiava sempre, creando inconsistenza
  // percepita. Ora: subject usa sempre il default del nuovo template, body
  // resettato se il vecchio template era plain e il nuovo no (o viceversa).
  const handleTemplateChange = (t: EmailTemplate) => {
    setTemplate(t);
    setSubject(DEFAULT_SUBJECTS[t]);
    if (t !== "plain") setBody("");
  };

  const handleSend = () => {
    if (!toIsValid) return;
    // FIX: form veniva lasciato popolato dopo l'invio → rischio doppio-invio
    // accidentale allo stesso destinatario. Ora reset body/subject on success,
    // `to` viene mantenuto (utile per re-send rapido con altro template).
    // Usiamo mutate(variables, options) che è supportato da TanStack Query.
    sendEmail(
      {
        to: to.trim(),
        subject: subject.trim() || DEFAULT_SUBJECTS[template],
        template,
        body: template === "plain" ? body : undefined,
      },
      {
        onSuccess: () => {
          setBody("");
          setSubject(DEFAULT_SUBJECTS[template]);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Send form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            Test Invio Email
          </CardTitle>
          <CardDescription>
            Invia un'email di test per verificare la configurazione del provider
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="email-test-to">Destinatario *</Label>
              <Input
                id="email-test-to"
                type="email"
                placeholder="test@esempio.it"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={isSending}
                aria-invalid={showToError || undefined}
                className={showToError ? "border-destructive focus-visible:ring-destructive" : undefined}
              />
              {showToError && (
                <p className="text-xs text-destructive">
                  Indirizzo email non valido (es. nome@dominio.it)
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select
                value={template}
                onValueChange={(v) => handleTemplateChange(v as EmailTemplate)}
                disabled={isSending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plain">Testo libero</SelectItem>
                  <SelectItem value="welcome">Email di benvenuto</SelectItem>
                  <SelectItem value="notification">Notifica sistema</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-test-subject">Oggetto</Label>
            <Input
              id="email-test-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={isSending}
            />
          </div>

          {template === "plain" && (
            <div className="space-y-1.5">
              <Label>Corpo email</Label>
              <Textarea
                placeholder="Testo del messaggio di prova..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                disabled={isSending}
              />
            </div>
          )}

          <Button
            onClick={handleSend}
            disabled={isSending || !toIsValid}
            className="w-full sm:w-auto"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {isSending ? "Invio in corso..." : "Invia email di test"}
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Ultimi test inviati
              {history.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {history.length}
                </Badge>
              )}
            </CardTitle>
            {history.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={clearHistory}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Cancella
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nessun test inviato in questa sessione</p>
            </div>
          ) : (
            <div>
              {history.map((result) => (
                <HistoryRow key={result.id} result={result} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
