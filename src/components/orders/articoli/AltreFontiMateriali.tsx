/**
 * In Nuova Commessa: i materiali che non si scrivono a mano. Un computo già caricato
 * (o il file, dopo) si collega alla commessa e, appena creata, si apre «Genera dal
 * computo»: la commessa deve esistere perché i materiali vadano nelle sue fasi.
 */
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface ComputoDaCollegare {
  /** Null: il file si carica subito dopo la creazione. */
  id: string | null;
  nome: string;
}

export function PulsanteDalComputo({ companyId, onScegli }: { companyId: string | undefined; onScegli: (c: ComputoDaCollegare) => void }) {
  const { data: computi = [] } = useQuery({
    queryKey: ["computi-senza-commessa", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("computo_uploads")
        .select("id, titolo, file_name, created_at")
        .eq("company_id", companyId!)
        .is("order_id", null)
        .in("extraction_status", ["review", "completed"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5"><FileText className="h-3.5 w-3.5" aria-hidden />Dal computo</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[min(24rem,calc(100vw-2rem))]">
        {computi.length > 0 && <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Computi non ancora collegati</DropdownMenuLabel>}
        {computi.map((c) => (
          <DropdownMenuItem key={c.id} onSelect={() => onScegli({ id: c.id, nome: c.titolo || c.file_name })}>
            <span className="truncate">{c.titolo || c.file_name}</span>
          </DropdownMenuItem>
        ))}
        {computi.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={() => onScegli({ id: null, nome: "file da caricare" })}>Carico il file dopo la creazione</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
