import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface VoiceAgent {
  id: string;
  nome: string;
  tipo: string;
  stato: string;
  elevenlabs_agent_id: string | null;
}

interface AiCallButtonProps {
  /** Numero da chiamare (E.164 o nazionale). Obbligatorio se manca contactId. */
  phone?: string | null;
  /** Se passato, l'edge function risolve il numero dal contatto e rispetta l'opt-out. */
  contactId?: string | null;
  contactName?: string | null;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  iconOnly?: boolean;
}

/**
 * Pulsante riutilizzabile "Chiama con AI": apre un dialog per scegliere un agente
 * vocale e avvia la chiamata tramite initiate-outbound-call (ElevenLabs + Telnyx).
 * Usato sia in Contatti che nella scheda Cliente. Legge gli agenti dal nuovo modello
 * ai_agents_v2 (quelli creati dalla pagina Agenti AI).
 */
export function AiCallButton({
  phone,
  contactId,
  contactName,
  label = "Chiama con AI",
  variant = "outline",
  size = "sm",
  className,
  iconOnly = false,
}: AiCallButtonProps) {
  const companyId = useEffectiveCompanyId();
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [calling, setCalling] = useState(false);

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["voice-agents-for-call", companyId],
    enabled: !!companyId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents_v2" as never)
        .select("id, nome, tipo, stato, elevenlabs_agent_id")
        .eq("company_id", companyId!)
        .in("tipo", ["vocale", "campagna"])
        .eq("stato", "attivo")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as VoiceAgent[];
    },
  });

  const noTarget = !phone && !contactId;

  const handleCall = async () => {
    if (!agentId) {
      toast.error("Seleziona un agente vocale");
      return;
    }
    setCalling(true);
    try {
      const body: Record<string, unknown> = { agent_id: agentId };
      if (contactId) body.contact_id = contactId;
      else if (phone) body.phone_number = phone;
      // Pre-check crediti: check-credits-before-call esisteva ma nessuno la
      // chiamava. Meglio un "ti mancano 0,10 €" prima, che un 402 muto dopo.
      const pre = await supabase.functions.invoke("check-credits-before-call", { body: { agentId } });
      const esito = pre.data as { allowed?: boolean; reason?: string; balance_eur?: number; min_required_eur?: number } | null;
      if (esito && esito.allowed === false) {
        const saldo = typeof esito.balance_eur === "number" ? esito.balance_eur.toFixed(2) : "?";
        const minimo = typeof esito.min_required_eur === "number" ? esito.min_required_eur.toFixed(2) : "0.10";
        throw new Error(
          esito.reason === "insufficient_balance"
            ? `Crediti AI insufficienti: saldo ${saldo} €, servono almeno ${minimo} €. Ricarica per chiamare.`
            : "Chiamate AI bloccate per questa azienda (credito esaurito). Ricarica per riattivarle.",
        );
      }
      const { data, error } = await supabase.functions.invoke("initiate-outbound-call", { body });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error?: string }).error);
      toast.success((data as { message?: string })?.message || "Chiamata AI avviata");
      setOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore nell'avvio della chiamata");
    } finally {
      setCalling(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={noTarget}
        onClick={() => setOpen(true)}
        title={noTarget ? "Numero mancante" : label}
      >
        <Phone className={iconOnly ? "h-4 w-4" : "h-3.5 w-3.5 mr-2"} />
        {!iconOnly && label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              Chiama con Agente AI
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Seleziona un agente vocale per chiamare
              {contactName ? <strong> {contactName}</strong> : ""}
              {phone ? <span className="font-mono"> ({phone})</span> : ""}.
            </p>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Caricamento agenti…
              </div>
            ) : agents.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Nessun agente vocale attivo. Creane uno in <strong>Agenti AI</strong> e collega un numero
                nella tab <strong>Telefonia</strong>.
              </p>
            ) : (
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger><SelectValue placeholder="Seleziona agente…" /></SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
            <Button onClick={handleCall} disabled={calling || !agentId || agents.length === 0}>
              {calling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Avvia chiamata
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
