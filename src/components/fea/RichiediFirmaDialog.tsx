import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Copy, Check, Send, FileSignature, Loader2, ExternalLink } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRichiediFirma, type RichiediFirmaInput } from "@/hooks/useRichiediFirma";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo_documento: "order" | "quote" | "sessione" | "odv";
  documento_id: string;
  documento_titolo?: string;
  default_email?: string;
  default_nome?: string;
  pdf_missing?: boolean; // se true, avvisa che il PDF non è ancora pronto
}

export function RichiediFirmaDialog({
  open, onOpenChange, tipo_documento, documento_id, documento_titolo,
  default_email = "", default_nome = "", pdf_missing = false,
}: Props) {
  const [email, setEmail] = useState(default_email);
  const [nome, setNome] = useState(default_nome);
  const [tipoFirmatario, setTipoFirmatario] = useState<"b2b" | "b2c">("b2c");
  const [scadenzaGiorni, setScadenzaGiorni] = useState<number>(14);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{ link: string; token: string; otpSent: boolean } | null>(null);

  const { mutate: richiedi, isPending } = useRichiediFirma();

  useEffect(() => {
    if (open) {
      setEmail(default_email);
      setNome(default_nome);
      setTipoFirmatario("b2c");
      setScadenzaGiorni(14);
      setResult(null);
      setCopied(false);
    }
  }, [open, default_email, default_nome]);

  const submit = () => {
    if (!email || !nome) {
      toast.error("Email e nome firmatario sono obbligatori");
      return;
    }
    if (!email.includes("@")) {
      toast.error("Email non valida");
      return;
    }
    const payload: RichiediFirmaInput = {
      tipo_documento,
      documento_id,
      tipo_firmatario: tipoFirmatario,
      signer_email: email.trim(),
      signer_name: nome.trim(),
      scadenza_giorni: scadenzaGiorni,
    };
    richiedi(payload, {
      onSuccess: (res) => {
        setResult({ link: res.firma_link, token: res.token, otpSent: res.otp_inviato });
        toast.success(
          res.otp_inviato
            ? "Richiesta firma inviata + OTP spedito via email"
            : "Richiesta creata. Copia il link e invia al firmatario.",
        );
      },
    });
  };

  const copyLink = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Link copiato negli appunti");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-orange-500" />
            Richiedi firma elettronica
          </DialogTitle>
          <DialogDescription>
            {documento_titolo ? `Documento: "${documento_titolo}"` : "Compila i dati del firmatario."}
          </DialogDescription>
        </DialogHeader>

        {pdf_missing && !result && (
          <Alert className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
            <AlertDescription className="text-sm text-yellow-900 dark:text-yellow-200">
              ⚠️ Il PDF del documento non è ancora stato generato. Generalo prima di inviare la richiesta.
            </AlertDescription>
          </Alert>
        )}

        {!result ? (
          <div className="space-y-3">
            <div>
              <Label>Email firmatario *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@esempio.it"
              />
            </div>
            <div>
              <Label>Nome e cognome *</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Mario Rossi"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo firmatario</Label>
                <Select value={tipoFirmatario} onValueChange={(v) => setTipoFirmatario(v as "b2b" | "b2c")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="b2c">B2C (consumatore)</SelectItem>
                    <SelectItem value="b2b">B2B (azienda)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Scadenza link (giorni)</Label>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  value={scadenzaGiorni}
                  onChange={(e) => setScadenzaGiorni(parseInt(e.target.value) || 14)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              B2C: il firmatario dovrà accettare recesso + clausole vessatorie oltre all'OTP.
              B2B: solo verifica OTP e firma.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
              <AlertDescription className="text-sm">
                {result.otpSent ? (
                  <>✅ Richiesta inviata con successo.
                    <br />OTP inviato a <strong>{email}</strong>.
                    <br />Il firmatario può cliccare il link e firmare.
                  </>
                ) : (
                  <>
                    ✅ Richiesta creata. L'OTP verrà richiesto quando il firmatario apre il link.
                  </>
                )}
              </AlertDescription>
            </Alert>

            <div>
              <Label className="text-xs">Link firma (condividilo con il cliente)</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input value={result.link} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="icon" asChild>
                  <a href={result.link} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Scade tra {scadenzaGiorni} giorni. OTP: 6 cifre, 10 min per inserimento.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
              <Button onClick={submit} disabled={isPending}>
                {isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Invio...</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" />Invia richiesta firma</>
                )}
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Chiudi</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
