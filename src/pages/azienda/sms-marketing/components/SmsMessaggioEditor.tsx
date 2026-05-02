/**
 * Editor messaggio SMS con counter 160 caratteri, preview e supporto variabili.
 * Counter: verde < 120, arancione 120-155, rosso >= 156.
 *
 * @param value - Testo del messaggio
 * @param onChange - Callback al cambio
 * @param previewNome - Nome per la preview variabili
 * @param error - Messaggio di errore
 */
import { Smartphone } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { calcolaPartiSms } from "@/lib/sms-utils";

const MAX_SMS_CHARS = 1530;

const VARIABILI = [
  { label: "{{nome}}", desc: "Nome contatto" },
  { label: "{{azienda}}", desc: "Nome azienda" },
  { label: "{{cantiere}}", desc: "Nome cantiere" },
];

interface SmsMessaggioEditorProps {
  value: string;
  onChange: (v: string) => void;
  previewNome?: string;
  error?: string;
}

function interpolaVariabili(msg: string, nome: string): string {
  return msg
    .replace(/\{\{nome\}\}/g, nome || "Mario")
    .replace(/\{\{azienda\}\}/g, "Edilizia Srl")
    .replace(/\{\{cantiere\}\}/g, "Via Roma 10");
}

export function SmsMessaggioEditor({ value, onChange, previewNome = "Mario", error }: SmsMessaggioEditorProps) {
  const smsInfo = calcolaPartiSms(value);
  const charCount = smsInfo.caratteriUsati;
  const smsParts = smsInfo.parti;
  const hardLimitReached = value.length >= MAX_SMS_CHARS;

  const counterColor =
    smsParts > 6 || smsInfo.caratteriRimanenti <= 5 ? "text-destructive font-semibold" :
    smsParts > 1 || smsInfo.caratteriRimanenti <= 30 ? "text-amber-600 font-medium" :
    "text-muted-foreground";

  const insertVariabile = (variabile: string) => {
    if (value.length + variabile.length > MAX_SMS_CHARS) return;
    onChange(value + variabile);
  };

  const preview = interpolaVariabili(value, previewNome);

  return (
    <div className="space-y-3">
      <Label htmlFor="messaggio" className="text-sm font-medium">Messaggio</Label>

      {/* Variabili rapide */}
      <div className="flex flex-wrap gap-1.5">
        {VARIABILI.map((v) => (
          <Button
            key={v.label}
            type="button"
            variant="outline"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => insertVariabile(v.label)}
            title={v.desc}
          >
            {v.label}
          </Button>
        ))}
      </div>

      {/* Textarea con counter */}
      <div className="relative">
        <Textarea
          id="messaggio"
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_SMS_CHARS))}
          rows={4}
          placeholder="Scrivi il tuo messaggio SMS..."
          className={`resize-none pr-14 ${error ? "border-destructive" : ""}`}
        />
        <span className={`absolute bottom-2 right-2 text-xs ${counterColor}`}>
          {charCount}/{smsInfo.caratteriPerParte}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{smsInfo.tipoCharset}</span>
        <span>{smsParts} SMS stimati</span>
        <span>{Math.max(0, smsInfo.caratteriRimanenti)} caratteri residui nella parte corrente</span>
      </div>

      {smsParts > 1 && (
        <p className="text-xs text-amber-600">
          Il testo verra' inviato come {smsParts} SMS concatenati. Controlla costo e anteprima prima dell'invio.
        </p>
      )}

      {hardLimitReached && (
        <p className="text-xs text-destructive">
          Limite massimo raggiunto: accorcia il messaggio prima di salvarlo.
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Preview smartphone */}
      {value && (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
          <Smartphone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">Preview SMS</p>
            <div className="bg-background rounded-md border px-3 py-2">
              <p className="text-sm break-words whitespace-pre-wrap">{preview}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
