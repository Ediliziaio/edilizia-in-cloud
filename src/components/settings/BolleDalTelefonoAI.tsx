/**
 * Bolle dal telefono: le legge subito l'AI o restano «da leggere» per l'ufficio (12/11/2026).
 * Sta in «Cosa fa Silvio da solo»: è la pagina dove l'azienda decide cosa fa l'AI da sola.
 * Il valore vive in company_acquisti_impostazioni.bolle_telefono_lettura e lo applica il server
 * (ddt_documento_accoda); la scrive acquisti_bolle_telefono_salva.
 */
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { useAuth } from "@/contexts/AuthContext";
import { useLetturaBolleTelefono, useSalvaLetturaBolleTelefono, type LetturaBolleTelefono } from "@/hooks/useImpostazioniAcquisti";

const MODI_BOLLE: Array<{ valore: LetturaBolleTelefono; titolo: string; descrizione: string }> = [
  {
    valore: "ai_subito",
    titolo: "Legge l'AI subito",
    descrizione: "Appena l'operaio invia la foto, l'AI legge fornitore, numero e righe: in ufficio la bolla arriva già compilata, da controllare. Ogni bolla consuma credito AI, anche quelle che poi non servono.",
  },
  {
    valore: "solo_foto",
    titolo: "Solo la foto: l'AI la avvia l'ufficio",
    descrizione: "L'operaio scatta e invia, niente AI. In «Documenti da registrare» l'ufficio sceglie bolla per bolla: «Leggi con l'AI» oppure «Compila a mano». Il credito AI si spende solo per le bolle che l'ufficio decide di far leggere.",
  },
];

/** Bolle dal telefono: le legge subito l'AI o restano da leggere per l'ufficio. */
export function BolleDalTelefono({ puoModificare }: { puoModificare: boolean }) {
  const { effectiveCompany } = useAuth();
  const lettura = useLetturaBolleTelefono(effectiveCompany?.id);
  const salva = useSalvaLetturaBolleTelefono();
  const valore = lettura.data ?? "ai_subito";
  return (
    <SezioneImpostazione
      id="bolle-telefono"
      titolo="Letture automatiche: bolle dal telefono"
      descrizione="Cosa succede quando un operaio fotografa una bolla dall'app cantiere. Per l'ufficio non cambia nulla: dal telefono decide ogni volta con l'interruttore «Leggi con l'AI»."
    >
      <RadioGroup
        value={valore}
        onValueChange={(v) => { if (v !== valore) salva.mutate(v as LetturaBolleTelefono); }}
        disabled={!puoModificare || lettura.isLoading || salva.isPending}
        className="gap-0 divide-y"
        aria-label="Bolle dal telefono: lettura AI"
      >
        {MODI_BOLLE.map((m) => (
          <div key={m.valore} className="flex items-start gap-3 px-4 py-3">
            <RadioGroupItem value={m.valore} id={`bolle-telefono-${m.valore}`} className="mt-0.5" aria-describedby={`bolle-telefono-${m.valore}-descrizione`} />
            <div className="min-w-0">
              <Label htmlFor={`bolle-telefono-${m.valore}`} className="text-sm font-medium leading-snug">
                {m.titolo}{m.valore === "ai_subito" && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(predefinito)</span>}
              </Label>
              <p id={`bolle-telefono-${m.valore}-descrizione`} className="mt-0.5 text-xs text-muted-foreground">{m.descrizione}</p>
            </div>
          </div>
        ))}
      </RadioGroup>
    </SezioneImpostazione>
  );
}
