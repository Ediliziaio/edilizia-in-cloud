import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Phone, Plus, Bot } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PhoneNumber } from "../types/phoneNumber.types";

export function PhoneNumberManager() {
  const { data: numbers, isLoading } = useQuery({
    queryKey: ["ai-agent-phone-numbers"],
    queryFn: async (): Promise<PhoneNumber[]> => {
      const { data, error } = await supabase
        .from("ai_agent_phone_numbers" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PhoneNumber[];
    },
  });

  // Fetch agents for mapping
  const { data: agents } = useQuery({
    queryKey: ["ai-agents-list-minimal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents" as never)
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const agentMap = new Map((agents ?? []).map((a) => [a.id, a.name]));

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
        <Button onClick={() => toast.info("L'acquisto numeri sarà disponibile nella prossima versione")} disabled>
          <Plus className="h-4 w-4 mr-2" /> Acquista numero
        </Button>
      </div>

      {!numbers?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <Phone className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">Nessun numero di telefono configurato</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Acquista o collega numeri di telefono per permettere ai tuoi agenti AI di ricevere ed effettuare chiamate.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numero</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Etichetta</TableHead>
                <TableHead>Agente collegato</TableHead>
                <TableHead>Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {numbers.map((num) => (
                <TableRow key={num.id}>
                  <TableCell className="font-mono font-medium">{num.phone_number}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">{num.provider}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{num.label || "—"}</TableCell>
                  <TableCell>
                    {agentMap.get(num.agent_id) ? (
                      <div className="flex items-center gap-1.5">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                        <span className="text-sm">{agentMap.get(num.agent_id)}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">Non assegnato</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="default" className="text-xs">Attivo</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
