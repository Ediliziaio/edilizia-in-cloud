/**
 * Righe di bolla che non sono entrate in magazzino quando il carico è stato confermato:
 * articolo non trovato, quantità oltre quanto l'ordine aspettava, quantità con decimali.
 * Restano qui finché chi gestisce il magazzino non le sistema (carico a mano, abbinamento
 * dell'articolo) e le segna fatte. Dati: magazzino_righe_da_abbinare / magazzino_righe_abbinate.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, PackageSearch } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface RigaDaAbbinare { descrizione: string | null; codice: string | null; quantita: number; motivo: string }
interface CaricoDaAbbinare {
  id: string; ddt_numero: string | null; ddt_data: string | null; confermato_il: string | null;
  ordine: string | null; righe: RigaDaAbbinare[];
}

const dataIt = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export function RigheDaAbbinareCard() {
  const { effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const qc = useQueryClient();
  const companyId = effectiveCompany?.id;
  const carichi = useQuery({
    queryKey: ["magazzino-righe-da-abbinare", companyId],
    enabled: !!companyId && !!permissions.canViewWarehouse,
    staleTime: 60_000,
    queryFn: async (): Promise<CaricoDaAbbinare[]> => {
      const { data, error } = await db.rpc("magazzino_righe_da_abbinare");
      if (error) throw error;
      return (data ?? []) as CaricoDaAbbinare[];
    },
  });
  const chiudi = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("magazzino_righe_abbinate", { p_carico: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Righe segnate come sistemate");
      void qc.invalidateQueries({ queryKey: ["magazzino-righe-da-abbinare"] });
    },
    onError: (e) => toast.error("Non sono riuscito a salvare", { description: e instanceof Error ? e.message : String(e) }),
  });

  const lista = carichi.data ?? [];
  if (lista.length === 0) return null;
  const totRighe = lista.reduce((s, c) => s + c.righe.length, 0);

  return (
    <section aria-labelledby="righe-da-abbinare" className="rounded-xl border border-amber-200 bg-card">
      <h2 id="righe-da-abbinare" className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
        <PackageSearch className="h-4 w-4 text-amber-600" aria-hidden="true" />Righe di bolla da sistemare
        <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{totRighe}</span>
      </h2>
      <p className="px-4 pt-2 text-xs text-muted-foreground">
        Merce arrivata ma non caricata in giacenza. Caricala a mano (o abbina l’articolo), poi segna «Fatto».
      </p>
      <ul className="divide-y">
        {lista.map((c) => (
          <li key={c.id} className="space-y-1.5 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                Bolla {c.ddt_numero ?? "s.n."}{c.ddt_data ? ` del ${dataIt(c.ddt_data)}` : ""}{c.ordine ? ` · ordine ${c.ordine}` : ""}
              </p>
              {permissions.canEditWarehouse && (
                <Button size="sm" variant="outline" className="gap-1.5" disabled={chiudi.isPending} onClick={() => chiudi.mutate(c.id)}>
                  <CheckCircle2 className="h-4 w-4" />Fatto
                </Button>
              )}
            </div>
            <ul className="space-y-0.5 text-muted-foreground">
              {c.righe.map((r, i) => (
                <li key={i}>
                  {r.descrizione || "Articolo senza descrizione"}{r.codice ? ` (cod. ${r.codice})` : ""} · {r.quantita} · <span className="text-amber-800">{r.motivo}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
