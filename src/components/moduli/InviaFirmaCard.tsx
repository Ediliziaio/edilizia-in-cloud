/**
 * InviaFirmaCard — ciclo di chiusura per i preventivi dei MODULI.
 *
 * Montata nello StepPdf degli 8 wizard: prepara la quote-ombra (quoteBridge),
 * invia l'email di firma col flusso esistente (send-quote-signature) e mostra
 * lo stato vivo (inviata → vista → firmata) con link copiabile. Da qui in poi
 * il reminder di scadenza (quote-expiry-reminder, cron) è automatico.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Send, Loader2, Copy, CheckCircle2, Eye, PenLine, Clock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  getModuleQuote, upsertModuleQuote, sendModuleQuoteSignature, signatureLink,
  type ModuleQuoteRow,
} from "@/lib/moduli/quoteBridge";

interface Props {
  companyId: string;
  moduleKey: string;
  progettoId: string;
  titolo: string;
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  subtotal: number;
  vatAmount: number;
  total: number;
  validityDays?: number;
  /** Rende il PDF corrente del modulo (stessa pipeline dell'anteprima). */
  generaPdfBlob: () => Promise<Blob>;
  /** Es. computo vuoto: blocca l'invio con motivo (niente PDF vuoto al cliente). */
  disabled?: boolean;
  disabledReason?: string;
}

export function InviaFirmaCard(props: Props) {
  const { user } = useAuth();
  const [working, setWorking] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState(props.clientEmail ?? "");
  const [messaggio, setMessaggio] = useState("");

  // Quote-ombra collegata al progetto (null = mai preparata). React Query:
  // niente fetch-in-effect e refetch pulito dopo l'invio.
  const { data: quote = null, isLoading: loading, refetch } = useQuery<ModuleQuoteRow | null>({
    queryKey: ["module-quote", props.companyId, props.moduleKey, props.progettoId],
    enabled: !!props.companyId && !!props.progettoId,
    queryFn: () => getModuleQuote(props.companyId, props.moduleKey, props.progettoId),
  });
  const refresh = async () => { await refetch(); };

  const handleInvia = async () => {
    if (!user?.id) { toast.error("Utente non autenticato"); return; }
    if (!email.trim() || !email.includes("@")) { toast.error("Inserisci l'email del cliente"); return; }
    if (props.total <= 0) { toast.error("Il preventivo non ha un totale: completa il computo"); return; }
    setWorking(true);
    try {
      const pdfBlob = await props.generaPdfBlob();
      const row = await upsertModuleQuote({
        companyId: props.companyId,
        userId: user.id,
        moduleKey: props.moduleKey,
        progettoId: props.progettoId,
        titolo: props.titolo,
        clientName: props.clientName,
        clientEmail: email.trim(),
        clientPhone: props.clientPhone ?? null,
        subtotal: props.subtotal,
        vatAmount: props.vatAmount,
        total: props.total,
        validityDays: props.validityDays ?? 30,
        pdfBlob,
      });
      await sendModuleQuoteSignature(row.id, email.trim(), props.clientName, messaggio.trim() || undefined);
      toast.success("Preventivo inviato per firma", {
        description: `Email a ${email.trim()} · il reminder di scadenza è automatico.`,
      });
      setDialogOpen(false);
      await refresh();
    } catch (e) {
      toast.error("Invio non riuscito", { description: e instanceof Error ? e.message : "Riprova." });
    } finally {
      setWorking(false);
    }
  };

  const copiaLink = () => {
    if (!quote?.signature_token) return;
    void navigator.clipboard.writeText(signatureLink(quote.signature_token));
    toast.success("Link di firma copiato");
  };

  const stato = quote?.signed_at
    ? { label: "Firmato dal cliente", icon: PenLine, cls: "bg-emerald-100 text-emerald-800" }
    : quote?.viewed_at
      ? { label: "Visto dal cliente", icon: Eye, cls: "bg-sky-100 text-sky-800" }
      : quote?.sent_at
        ? { label: "Inviato — in attesa", icon: Clock, cls: "bg-amber-100 text-amber-800" }
        : null;

  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <Send className="h-4 w-4 text-emerald-600" />
            Invia e fai firmare online
          </span>
          {stato && (
            <Badge className={`text-[10px] ${stato.cls}`} variant="secondary">
              <stato.icon className="h-3 w-3 mr-1" />
              {stato.label}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-[11px] text-muted-foreground">
          Il cliente riceve il PDF con un link per firmare (o rifiutare) online:
          vedi quando lo apre e il promemoria di scadenza parte da solo.
        </p>
        {props.disabled && (
          <p className="text-[11px] text-amber-700 flex items-center gap-1">
            <Clock className="h-3 w-3 shrink-0" />
            {props.disabledReason || "Completa il preventivo per poterlo inviare."}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="h-8 bg-emerald-600 hover:bg-emerald-700"
            disabled={loading || working || props.disabled || !!quote?.signed_at}
            onClick={() => {
              // Riallinea l'email al valore corrente del cliente ad ogni apertura:
              // se il venditore l'ha compilata/cambiata in un altro step, il dialog
              // non deve mostrare il valore vecchio catturato al mount.
              if (props.clientEmail && !email.trim()) setEmail(props.clientEmail);
              setDialogOpen(true);
            }}
          >
            {working ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
            {quote?.sent_at ? "Reinvia aggiornato" : "Invia per firma"}
          </Button>
          {quote?.signature_token && (
            <Button size="sm" variant="outline" className="h-8" onClick={copiaLink}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copia link firma
            </Button>
          )}
          {quote?.signed_at && (
            <span className="flex items-center gap-1 text-xs text-emerald-700 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {new Date(quote.signed_at).toLocaleDateString("it-IT")}
            </span>
          )}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Invia per firma</DialogTitle>
              <DialogDescription>
                Genera il PDF aggiornato e lo invia a {props.clientName || "il cliente"} con il link di firma.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Email del cliente</Label>
                <Input
                  type="email"
                  className="h-9 mt-1"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@esempio.it"
                />
              </div>
              <div>
                <Label className="text-xs">Messaggio (opzionale)</Label>
                <Input
                  className="h-9 mt-1"
                  value={messaggio}
                  onChange={(e) => setMessaggio(e.target.value)}
                  placeholder="Come da accordi, ecco il preventivo…"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={working}>Annulla</Button>
              <Button onClick={() => void handleInvia()} disabled={working} className="bg-emerald-600 hover:bg-emerald-700">
                {working ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                Invia ora
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
