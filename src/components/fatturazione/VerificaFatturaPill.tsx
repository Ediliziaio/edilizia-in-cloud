/** Verificata o da verificare: si sceglie in tutti e due i sensi e non tocca la contabilità. */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatoPill } from "@/components/orders/TabellaCommessa";
import { supabase } from "@/integrations/supabase/client";

export function VerificaFatturaPill({ id, numero, verificata, puoCambiare, avviso = false, altreAzioni }: {
  id: string; numero: string | null; verificata: boolean; puoCambiare: boolean; /** Verificata, ma con qualcosa che non torna. */ avviso?: boolean; altreAzioni?: Array<{ testo: string; fai: () => void }>;
}) {
  const queryClient = useQueryClient();
  const segna = useMutation({
    mutationFn: async (valore: boolean) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("fattura_segna_verifica", { p_fattura_id: id, p_verificata: valore });
      if (error) throw error;
    },
    onSuccess: (_d, valore) => {
      toast.success(`Fattura ${numero ?? ""} ${valore ? "verificata" : "da verificare"}`);
      for (const k of ["fatture-ricevute", "commessa-fatture-fornitori", "fattura-ricevuta-riepilogo"]) void queryClient.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error("Verifica non salvata", { description: e instanceof Error ? e.message : String(e) }),
  });
  const tono = verificata && !avviso ? "verde" : "ambra";
  const testo = verificata ? "Verificata" : "Da verificare";
  if (!puoCambiare) return <StatoPill tono={tono}>{testo}</StatoPill>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={segna.isPending} aria-label={`Cambia la verifica della fattura ${numero ?? ""}`}>
        <StatoPill tono={tono}>{testo}<ChevronDown className="ml-1 inline h-3 w-3" aria-hidden="true" /></StatoPill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem disabled={verificata} onSelect={() => segna.mutate(true)}>Verificata</DropdownMenuItem>
        <DropdownMenuItem disabled={!verificata} onSelect={() => segna.mutate(false)}>Da verificare</DropdownMenuItem>
        {altreAzioni?.map((a) => <DropdownMenuItem key={a.testo} onSelect={a.fai}>{a.testo}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
