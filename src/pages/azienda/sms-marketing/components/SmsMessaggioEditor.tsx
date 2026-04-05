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
  const charCount = value.length;
  const maxChars = 160;
  const smsParts = charCount > 160 ? Math.ceil(charCount / 153) : 1;

  const counterColor =
    charCount >= 156 ? "text-destructive font-semibold" :
    charCount >= 120 ? "text-amber-600 font-medium" :
    "text-muted-foreground";

  const insertVariabile = (variabile: string) => {
    if (value.length + variabile.length > maxChars) return;
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
          onChange={(e) => onChange(e.target.value.slice(0, maxChars))}
          rows={4}
          placeholder="Scrivi il tuo messaggio SMS..."
          className={`resize-none pr-14 ${error ? "border-destructive" : ""}`}
        />
        <span className={`absolute bottom-2 right-2 text-xs ${counterColor}`}>
          {charCount}/{maxChars}
        </span>
      </div>

      {smsParts > 1 && (
        <p className="text-xs text-amber-600">
          ⚠️ Il messaggio supera 160 caratteri e verrà diviso in {smsParts} SMS (multi-part).
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
