/**
 * InviaFirmaCard — ciclo di chiusura per i preventivi dei MODULI.
 *
 * Montata nello StepPdf degli 8 wizard: prepara la quote-ombra (quoteBridge),
 * invia l'email di firma col flusso esistente (send-quote-signature) e mostra
 * lo stato vivo (inviata → vista → firmata) con link copiabile. Da qui in poi
 * il reminder di scadenza (quote-expiry-reminder, cron) è automatico.
 *
 * Sul telefono la card sparisce: resta una riga con lo stato e le azioni
 * scendono nella barra in basso del passo — indietro, PDF (da guardare o da
 * mandare con WhatsApp, Mail…) e «Invia per firma».
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
import { Send, Loader2, Copy, CheckCircle2, Eye, PenLine, Clock, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { condividiLink } from "@/lib/mobile/condividiFile";
import { cn } from "@/lib/utils";
import { BarraInvioMobile } from "@/components/moduli/BarraInvioMobile";
import {
  getModuleQuote, upsertModuleQuote, sendModuleQuoteSignature, signatureLink, resolveModuleSignatureLink,
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
  /** Il PDF si può già generare (di solito: il computo ha voci). Di base vale `!disabled`. */
  pdfDisponibile?: boolean;
  /** Telefono: con questa la card disegna la barra in basso del passo (indietro · PDF · invia). */
  onIndietro?: () => void;
}

export function InviaFirmaCard(props: Props) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
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

  const apriInvio = () => {
    if (props.disabled) {
      toast.error(props.disabledReason || "Completa il preventivo per poterlo inviare.");
      return;
    }
    // Riallinea l'email al valore corrente del cliente ad ogni apertura:
    // se il venditore l'ha compilata/cambiata in un altro step, il dialog
    // non deve mostrare il valore vecchio catturato al mount.
    if (props.clientEmail && !email.trim()) setEmail(props.clientEmail);
    setDialogOpen(true);
  };

  const linkFirma = async () => {
    if (!quote) return null;
    const link = (await resolveModuleSignatureLink(quote.id))
      ?? (quote.signature_token ? signatureLink(quote.signature_token) : null);
    if (!link) toast.error("Nessun link di firma: invia prima il preventivo");
    return link;
  };

  const copiaLink = async () => {
    const link = await linkFirma();
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success("Link di firma copiato");
  };

  // Dal telefono il link si manda col foglio di condivisione: WhatsApp in un tocco.
  const mandaLink = async () => {
    const link = await linkFirma();
    if (!link) return;
    const esito = await condividiLink(link, props.titolo);
    if (esito === "non-supportato") {
      await navigator.clipboard.writeText(link);
      toast.success("Link di firma copiato");
    } else if (esito === "serve-un-tocco") {
      toast.success("Link di firma pronto", {
        action: { label: "Manda", onClick: () => { void condividiLink(link, props.titolo); } },
        duration: 10000,
      });
    }
  };

  const stato = quote?.signed_at
    ? { label: "Firmato dal cliente", icon: PenLine, cls: "bg-emerald-100 text-emerald-800" }
    : quote?.viewed_at
      ? { label: "Visto dal cliente", icon: Eye, cls: "bg-sky-100 text-sky-800" }
      : quote?.sent_at
        ? { label: "Inviato — in attesa", icon: Clock, cls: "bg-amber-100 text-amber-800" }
        : null;

  const dialogInvio = (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invia per firma</DialogTitle>
          <DialogDescription className="max-sm:sr-only">
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
          <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={working} className="max-sm:hidden">Annulla</Button>
          <Button onClick={() => void handleInvia()} disabled={working} className="bg-emerald-600 hover:bg-emerald-700">
            {working ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            Invia ora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (isMobile && props.onIndietro) {
    const pdfDisponibile = props.pdfDisponibile ?? !props.disabled;
    return (
      <>
        {stato && (
          <div className={cn("flex items-center gap-2 rounded-xl px-3 py-2", stato.cls)}>
            <stato.icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
              {stato.label}
              {quote?.signed_at && ` il ${new Date(quote.signed_at).toLocaleDateString("it-IT")}`}
            </span>
            {!quote?.signed_at && (quote?.sent_at || quote?.signature_token) && (
              <Button
                variant="ghost"
                size="sm"
                className="tap-compact -my-1 h-8 gap-1.5 px-2 text-xs"
                onClick={() => { void mandaLink(); }}
              >
                <Link2 className="h-3.5 w-3.5" /> Link firma
              </Button>
            )}
          </div>
        )}

        <BarraInvioMobile
          onIndietro={props.onIndietro}
          titolo={props.titolo}
          generaPdf={props.generaPdfBlob}
          pdfBloccato={pdfDisponibile ? null : props.disabledReason || "Completa il preventivo per generare il PDF."}
        >
          {quote?.signed_at ? (
            <Button disabled className="h-11 flex-1 gap-1.5 bg-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Firmato
            </Button>
          ) : (
            <Button
              className={cn("h-11 flex-1 gap-1.5 bg-orange-500 hover:bg-orange-600", props.disabled && "opacity-60")}
              disabled={loading || working}
              onClick={apriInvio}
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {quote?.sent_at ? "Reinvia" : "Invia per firma"}
            </Button>
          )}
        </BarraInvioMobile>
        {dialogInvio}
      </>
    );
  }

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
            onClick={apriInvio}
          >
            {working ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
            {quote?.sent_at ? "Reinvia aggiornato" : "Invia per firma"}
          </Button>
          {(quote?.sent_at || quote?.signature_token) && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => { void copiaLink(); }}>
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

        {dialogInvio}
      </CardContent>
    </Card>
  );
}
