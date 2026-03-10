import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Phone, Plus, Bot, Link2, Trash2, Search, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { callElevenLabsProxy } from "../hooks/useElevenLabsProxy";
import { queryKeys } from "@/lib/queryKeys";

interface PhoneNumberRow {
  id: string;
  company_id: string;
  agent_id: string;
  phone_number: string;
  provider: string;
  label: string | null;
  elevenlabs_phone_id: string | null;
  elevenlabs_phone_number_id: string | null;
  telnyx_phone_id: string | null;
  monthly_cost_eur: number;
  is_inbound_enabled: boolean;
  is_outbound_enabled: boolean;
  created_at: string;
}

interface AvailableNumber {
  phone_number: string;
  monthly_cost?: { amount?: string; currency?: string };
  region_information?: Array<{ region_name?: string }>;
  features?: Array<{ name: string }>;
}

export function PhoneNumberManager() {
  const queryClient = useQueryClient();
  const [showBuyDialog, setShowBuyDialog] = useState(false);
  const [searchPrefix, setSearchPrefix] = useState("39");
  const [searchResults, setSearchResults] = useState<AvailableNumber[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  const [buyAgentId, setBuyAgentId] = useState("");
  const [buyLabel, setBuyLabel] = useState("");
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const { data: numbers, isLoading } = useQuery({
    queryKey: queryKeys.aiAgents.phoneNumbers(),
    queryFn: async (): Promise<PhoneNumberRow[]> => {
      const { data, error } = await supabase
        .from("ai_agent_phone_numbers" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PhoneNumberRow[];
    },
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.aiAgents.listMinimal(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents" as never)
        .select("id, name, elevenlabs_agent_id")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; elevenlabs_agent_id: string | null }[];
    },
  });

  const agentMap = new Map((agents ?? []).map((a) => [a.id, a]));

  const handleSearch = async () => {
    setIsSearching(true);
    setSearchResults([]);
    try {
      const { data, error } = await supabase.functions.invoke("telnyx-proxy", {
        body: {
          action: "list_available_numbers",
          payload: { country_code: "IT", prefix: searchPrefix, limit: 20 },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSearchResults(data?.numbers || []);
      if (!data?.numbers?.length) toast.info("Nessun numero trovato con questo prefisso");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore nella ricerca");
    } finally {
      setIsSearching(false);
    }
  };

  const handleBuy = async () => {
    if (!selectedNumber || !buyAgentId) {
      toast.error("Seleziona un numero e un agente");
      return;
    }
    setIsBuying(true);
    try {
      const { data, error } = await supabase.functions.invoke("telnyx-proxy", {
        body: {
          action: "buy_number",
          payload: {
            phone_number: selectedNumber,
            agent_id: buyAgentId,
            label: buyLabel || null,
            monthly_cost: 1.0,
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Numero ${selectedNumber} acquistato!`);
      setShowBuyDialog(false);
      setSelectedNumber(null);
      setSearchResults([]);
      setBuyLabel("");
      queryClient.invalidateQueries({ queryKey: queryKeys.aiAgents.phoneNumbers() });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore nell'acquisto");
    } finally {
      setIsBuying(false);
    }
  };

  const handleLinkToElevenLabs = async (num: PhoneNumberRow) => {
    const agent = agentMap.get(num.agent_id);
    if (!agent?.elevenlabs_agent_id) {
      toast.error("L'agente non ha un ID ElevenLabs configurato");
      return;
    }
    setLinkingId(num.id);
    try {
      const result = await callElevenLabsProxy<{ elevenlabs_phone_number_id?: string }>({
        action: "link_phone_number" as never,
        agent_id: agent.elevenlabs_agent_id,
        payload: {
          phone_number: num.phone_number,
          telnyx_phone_id: num.telnyx_phone_id,
          local_phone_id: num.id,
        },
      });
      if (result?.elevenlabs_phone_number_id) {
        toast.success("Numero collegato a ElevenLabs");
        queryClient.invalidateQueries({ queryKey: ["ai-agent-phone-numbers"] });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore nel collegamento");
    } finally {
      setLinkingId(null);
    }
  };

  const handleDelete = async (num: PhoneNumberRow) => {
    if (!confirm(`Eliminare il numero ${num.phone_number}?`)) return;
    try {
      if (num.telnyx_phone_id) {
        await supabase.functions.invoke("telnyx-proxy", {
          body: { action: "release_number", payload: { phone_number_id: num.telnyx_phone_id } },
        });
      }
      await supabase
        .from("ai_agent_phone_numbers" as never)
        .delete()
        .eq("id" as never, num.id as never);
      toast.success("Numero rimosso");
      queryClient.invalidateQueries({ queryKey: ["ai-agent-phone-numbers"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore nella rimozione");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Phone className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Numeri di Telefono</h1>
          <Badge variant="outline">{numbers?.length ?? 0} numeri</Badge>
        </div>
        <Button onClick={() => setShowBuyDialog(true)}>
          <Plus className="h-4 w-4 mr-2" /> Acquista numero
        </Button>
      </div>

      {!numbers?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <Phone className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">Nessun numero di telefono configurato</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Acquista numeri di telefono Telnyx per permettere ai tuoi agenti AI di ricevere ed effettuare chiamate e SMS.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numero</TableHead>
                <TableHead>Etichetta</TableHead>
                <TableHead>Agente</TableHead>
                <TableHead>Costo/mese</TableHead>
                <TableHead>ElevenLabs</TableHead>
                <TableHead>Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {numbers.map((num) => {
                const agent = agentMap.get(num.agent_id);
                const isLinked = !!num.elevenlabs_phone_number_id || !!num.elevenlabs_phone_id;
                return (
                  <TableRow key={num.id}>
                    <TableCell className="font-mono font-medium">{num.phone_number}</TableCell>
                    <TableCell className="text-muted-foreground">{num.label || "—"}</TableCell>
                    <TableCell>
                      {agent ? (
                        <div className="flex items-center gap-1.5">
                          <Bot className="h-3.5 w-3.5 text-primary" />
                          <span className="text-sm">{agent.name}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Non assegnato</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">€{(num.monthly_cost_eur || 0).toFixed(2)}</span>
                    </TableCell>
                    <TableCell>
                      {isLinked ? (
                        <Badge variant="default" className="text-[10px]">Collegato</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Non collegato</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {!isLinked && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleLinkToElevenLabs(num)}
                            disabled={linkingId === num.id}
                            title="Collega a ElevenLabs"
                          >
                            {linkingId === num.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Link2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDelete(num)}
                          title="Elimina numero"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Buy Number Dialog */}
      <Dialog open={showBuyDialog} onOpenChange={setShowBuyDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" /> Acquista Numero Telnyx
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Prefisso / Paese</Label>
                <Input
                  value={searchPrefix}
                  onChange={(e) => setSearchPrefix(e.target.value)}
                  placeholder="39"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleSearch} disabled={isSearching} variant="outline">
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="ml-2">Cerca</span>
                </Button>
              </div>
            </div>

            {searchResults.length > 0 && (
              <div className="max-h-[200px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead></TableHead>
                      <TableHead>Numero</TableHead>
                      <TableHead>Regione</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchResults.map((n) => (
                      <TableRow
                        key={n.phone_number}
                        className={`cursor-pointer ${selectedNumber === n.phone_number ? "bg-primary/10" : ""}`}
                        onClick={() => setSelectedNumber(n.phone_number)}
                      >
                        <TableCell>
                          <input
                            type="radio"
                            checked={selectedNumber === n.phone_number}
                            onChange={() => setSelectedNumber(n.phone_number)}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{n.phone_number}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {n.region_information?.[0]?.region_name || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs">Agente da collegare</Label>
              <Select value={buyAgentId} onValueChange={setBuyAgentId}>
                <SelectTrigger><SelectValue placeholder="Seleziona agente..." /></SelectTrigger>
                <SelectContent>
                  {(agents ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Etichetta (opzionale)</Label>
              <Input value={buyLabel} onChange={(e) => setBuyLabel(e.target.value)} placeholder="es. Linea principale" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBuyDialog(false)}>Annulla</Button>
            <Button onClick={handleBuy} disabled={isBuying || !selectedNumber || !buyAgentId}>
              {isBuying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Acquista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
