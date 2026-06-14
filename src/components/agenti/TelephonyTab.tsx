import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { callElevenLabsProxy } from "@/modules/ai-agents/hooks/useElevenLabsProxy";
import { useUnifiedAgents } from "@/hooks/useUnifiedAgents";
import {
  Phone,
  RefreshCw,
  Loader2,
  Link2,
  Unlink,
  Bot,
  CheckCircle,
  XCircle,
  Download,
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

  // Importa nella tab Telefonia i numeri Telnyx già posseduti dall'azienda
  // (stesso account usato per gli SMS): virtual_phone_numbers + sms_telnyx_numbers.
  // Da qui possono poi essere assegnati a un agente e collegati a ElevenLabs.
  const norm = (s: string) => (s || "").replace(/\s+/g, "");
  const importTelnyx = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const existing = new Set(numbers.map((n) => norm(n.numero)));
      const found: { numero: string; etichetta: string | null }[] = [];

      // Numeri virtuali (voce+sms) — fonte principale per la voce
      const vpn = await supabase
        .from("virtual_phone_numbers")
        .select("phone_number, friendly_name, is_active")
        .eq("company_id", companyId)
        .eq("is_active", true);
      (vpn.data ?? []).forEach((r: { phone_number?: string | null; friendly_name?: string | null }) => {
        if (r.phone_number) found.push({ numero: r.phone_number, etichetta: r.friendly_name ?? null });
      });

      // Numeri Telnyx dedicati agli SMS (best-effort: se RLS li nasconde resta [])
      const sms = await supabase
        .from("sms_telnyx_numbers")
        .select("numero_e164, numero_display, stato")
        .eq("company_id", companyId)
        .eq("stato", "attivo");
      (sms.data ?? []).forEach((r: { numero_e164?: string | null; numero_display?: string | null }) => {
        if (r.numero_e164) found.push({ numero: r.numero_e164, etichetta: r.numero_display ?? null });
      });

      const seen = new Set<string>();
      const toInsert = found
        .filter((s) => !existing.has(norm(s.numero)))
        .filter((s) => { const k = norm(s.numero); if (seen.has(k)) return false; seen.add(k); return true; })
        .map((s) => ({
          company_id: companyId,
          numero: s.numero,
          nome_etichetta: s.etichetta,
          provider: "telnyx",
          capacita: ["voce", "sms"],
          attivo: true,
        }));

      if (toInsert.length === 0) return { inserted: 0 };
      const { error } = await supabase.from("ai_phone_numbers_v2" as never).insert(toInsert as never);
      if (error) throw error;
      return { inserted: toInsert.length };
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["ai-phone-numbers-v2"] });
      if (r.inserted > 0) toast.success(`${r.inserted} numero/i Telnyx importato/i`);
      else toast.info("Nessun nuovo numero Telnyx da importare");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Errore import numeri Telnyx"),
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
      toast.success("Numero collegato a ElevenLabs — l'agente può ora chiamare");
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            Numeri Telefonici
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestisci i numeri assegnati agli agenti vocali e sincronizza con ElevenLabs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => importTelnyx.mutate()} disabled={importTelnyx.isPending}>
            {importTelnyx.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Download className="h-4 w-4 mr-1.5" />}
            Importa numeri Telnyx
          </Button>
          <Button variant="outline" size="sm" onClick={syncFromEL} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Sync ElevenLabs
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : numbers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
            <Phone className="h-7 w-7 text-primary" />
          </div>
          <p className="text-foreground font-medium">Nessun numero configurato</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Usa <strong>Importa numeri Telnyx</strong> per portare qui i numeri che usi già per gli SMS:
            potrai assegnarli a un agente vocale e collegarli per le chiamate.
          </p>
          <Button variant="default" size="sm" className="mt-4" onClick={() => importTelnyx.mutate()} disabled={importTelnyx.isPending}>
            {importTelnyx.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Download className="h-4 w-4 mr-1.5" />}
            Importa numeri Telnyx
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
