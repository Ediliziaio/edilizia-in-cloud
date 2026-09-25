import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { callElevenLabsProxy } from "@/modules/ai-agents/hooks/useElevenLabsProxy";
import { useUnifiedAgents } from "@/hooks/useUnifiedAgents";
import { Link } from "react-router-dom";
import {
  Phone,
  RefreshCw,
  Loader2,
  Link2,
  Unlink,
  Bot,
  CheckCircle,
  XCircle,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface PhoneNumberV2 {
  id: string;
  company_id: string;
  numero: string;
  nome_etichetta: string | null;
  agent_id: string | null;
  provider: string | null;
  elevenlabs_phone_id: string | null;
  attivo: boolean;
  capacita: string[] | null;
  creato_il: string;
}

export function TelephonyTab() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const { data: numbers = [], isLoading } = useQuery({
    queryKey: ["ai-phone-numbers-v2", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_phone_numbers_v2" as never)
        .select("*")
        .eq("company_id", companyId!)
        .order("creato_il", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PhoneNumberV2[];
    },
  });

  const { data: allAgentsRaw = [] } = useUnifiedAgents();
  const allAgents = allAgentsRaw.filter(a => a.tipo === "vocale" || a.tipo === "campagna");

  const assignAgent = useMutation({
    mutationFn: async ({ numberId, agentId }: { numberId: string; agentId: string | null }) => {
      const { error } = await supabase
        .from("ai_phone_numbers_v2" as never)
        .update({ agent_id: agentId } as never)
        .eq("id", numberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-phone-numbers-v2"] });
      toast.success("Agente assegnato");
    },
  });

  // Collega il numero a ElevenLabs (provisioning sullo stesso account Telnyx):
  // dopo questo passaggio l'agente vocale può effettuare chiamate da quel numero.
  const linkToEL = useMutation({
    mutationFn: async (num: PhoneNumberV2) => {
      const agent = allAgents.find((a) => a.id === num.agent_id) as
        | { id: string; nome: string; elevenlabs_agent_id?: string | null }
        | undefined;
      if (!agent) throw new Error("Assegna prima un agente vocale al numero");
      if (!agent.elevenlabs_agent_id) throw new Error("L'agente non è ancora collegato a ElevenLabs");
      const res = await callElevenLabsProxy<{ elevenlabs_phone_number_id?: string }>({
        action: "link_phone_number",
        agent_id: agent.elevenlabs_agent_id,
        payload: { phone_number: num.numero },
      });
      const elPhoneId = res?.elevenlabs_phone_number_id;
      if (!elPhoneId) throw new Error("ElevenLabs non ha restituito un ID per il numero");
      const { error } = await supabase
        .from("ai_phone_numbers_v2" as never)
        .update({ elevenlabs_phone_id: elPhoneId } as never)
        .eq("id", num.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-phone-numbers-v2"] });
      toast.success("Numero collegato a ElevenLabs — l'agente può chiamare e RICEVERE su questo numero");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Errore collegamento ElevenLabs"),
  });

  const syncFromEL = async () => {
    setSyncing(true);
    try {
      const result = await callElevenLabsProxy<{ phone_numbers?: { phone_number_id: string; phone_number: string; agent_id: string | null }[] }>({
        action: "get_phone_numbers",
      });
      const elNumbers = result?.phone_numbers || [];
      toast.success(`${elNumbers.length} numeri trovati su ElevenLabs`);
      queryClient.invalidateQueries({ queryKey: ["ai-phone-numbers-v2"] });
    } catch (e: any) {
      toast.error(e.message || "Errore nella sincronizzazione");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Solo le azioni, a destra: il titolo «Numeri Telefonici» ripeteva la
          scheda e la frase su Impostazioni → Telefonia la ripete il riquadro
          vuoto qui sotto (con il suo bottone). */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/azienda/impostazioni/numeri-telefono"><Settings2 className="h-4 w-4 mr-1.5" /> Gestisci numeri</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={syncFromEL} disabled={syncing} title="Sincronizza i numeri con ElevenLabs">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            {/* «Sync» all'inglese: il nome del servizio resta nel suggerimento. */}
            Sincronizza
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : numbers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
            <Phone className="h-7 w-7 text-primary" />
          </div>
          <p className="text-foreground font-medium">Nessun numero configurato</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            I numeri per le chiamate AI si aggiungono in <strong>Impostazioni → Telefonia</strong>
            (sezione "Numeri per chiamate AI"). Poi qui li assegni a un agente vocale.
          </p>
          <Button asChild variant="default" size="sm" className="mt-4">
            <Link to="/azienda/impostazioni/numeri-telefono"><Settings2 className="h-4 w-4 mr-1.5" /> Vai a Telefonia</Link>
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numero</TableHead>
                <TableHead>Etichetta</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Agente Assegnato</TableHead>
                <TableHead>EL Sync</TableHead>
                <TableHead>Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {numbers.map((num) => {
                const assignedAgent = allAgents.find((a) => a.id === num.agent_id);
                return (
                  <TableRow key={num.id}>
                    <TableCell className="font-mono text-sm font-medium">{num.numero}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {num.nome_etichetta || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {num.provider || "telnyx"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={num.agent_id || "none"}
                        onValueChange={(v) =>
                          assignAgent.mutate({ numberId: num.id, agentId: v === "none" ? null : v })
                        }
                      >
                        <SelectTrigger className="w-48 h-8 text-xs">
                          <SelectValue placeholder="Nessun agente" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="flex items-center gap-1.5">
                              <Unlink className="h-3 w-3" /> Nessuno
                            </span>
                          </SelectItem>
                          {allAgents.map((ag) => (
                            <SelectItem key={ag.id} value={ag.id}>
                              <span className="flex items-center gap-1.5">
                                <Bot className="h-3 w-3" /> {ag.nome}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {num.elevenlabs_phone_id ? (
                        <span className="flex items-center gap-1 text-xs text-primary">
                          <Link2 className="h-3 w-3" /> Collegato
                        </span>
                      ) : num.agent_id ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => linkToEL.mutate(num)}
                          disabled={linkToEL.isPending && linkToEL.variables?.id === num.id}
                        >
                          {linkToEL.isPending && linkToEL.variables?.id === num.id ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <Link2 className="h-3 w-3 mr-1" />
                          )}
                          Collega per chiamate
                        </Button>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Unlink className="h-3 w-3" /> Assegna un agente
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {num.attivo ? (
                        <span className="flex items-center gap-1 text-xs text-primary">
                          <CheckCircle className="h-3.5 w-3.5" /> Attivo
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <XCircle className="h-3.5 w-3.5" /> Disattivo
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
