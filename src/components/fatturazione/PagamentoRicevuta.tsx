import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatDateShort } from "@/lib/formatters";
import { queryKeys } from "@/lib/queryKeys";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { cn } from "@/lib/utils";

/**
 * «L'ho pagata» sulle fatture dei fornitori, con un clic. La data sta sulla fattura
 * (`pagata_il`); se la fattura è contabilizzata e ha le rate, anche le rate diventano
 * pagate e con loro costo e scadenzario (`segna_fattura_ricevuta_pagata`). Vale per chi
 * fattura con Edilizia in Cloud e per chi importa da un altro programma.
 */

/** Il tipo della fattura ricevuta in parole: i gestionali passano sigle diverse. */
const TIPI_RICEVUTA: Record<string, string> = {
  expense: "Fattura",
  TD01: "Fattura",
  TD02: "Acconto",
  TD03: "Acconto parcella",
  TD04: "Nota di credito",
  passive_credit_note: "Nota di credito",
  TD05: "Nota di debito",
  TD06: "Parcella",
  TD16: "Reverse charge",
  TD17: "Autofattura servizi estero",
  TD18: "Autofattura beni UE",
  TD19: "Autofattura beni extra UE",
  TD24: "Fattura differita",
  TD25: "Fattura differita",
  TD26: "Cessione beni ammortizzabili",
  TD27: "Autoconsumo",
  self_invoice: "Autofattura",
};

export function etichettaTipoRicevuta(tipo: string | null | undefined): string {
  if (!tipo) return "—";
  return TIPI_RICEVUTA[tipo] ?? tipo;
}

/** Una nota di credito del fornitore non si paga: riduce quello che gli devi. */
export function isNotaCreditoRicevuta(tipo: string | null | undefined): boolean {
  return tipo === "TD04" || tipo === "passive_credit_note";
}

/** Per ogni fattura ricevuta dell'azienda, il giorno in cui è stata pagata (o assente). */
export function usePagamentiRicevute(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["fatture-ricevute-pagamento", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const righe = await tutteLePagine((from, to) => supabase
        .from("fatture_ricevute_pagamento" as never)
        .select("id, pagata_il")
        .eq("company_id", companyId!)
        .not("pagata_il", "is", null)
        .order("id", { ascending: true })
        .range(from, to)) as unknown as { id: string; pagata_il: string }[];
      return new Map(righe.map((r) => [r.id, r.pagata_il]));
    },
    staleTime: 30_000,
  });
}

export function useSegnaRicevutaPagata() {
  const queryClient = useQueryClient();
  const invalida = () => {
    void queryClient.invalidateQueries({ queryKey: ["fatture-ricevute-pagamento"] });
    void queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
    void queryClient.invalidateQueries({ queryKey: ["fattura-ricevuta-riepilogo"] });
    // Le rate pagate spostano costi, scadenzario e cassa.
    void queryClient.invalidateQueries({ queryKey: queryKeys.costs.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.scadenzario.all });
    void queryClient.invalidateQueries({ queryKey: ["cashflow"] });
  };
  const segna = async (id: string, pagata: boolean, data?: string) => {
    const { error } = await supabase.rpc("segna_fattura_ricevuta_pagata" as never, {
      p_id: id, p_pagata: pagata, p_data: data ?? null,
    } as never);
    if (error) throw error;
  };
  return useMutation({
    mutationFn: ({ id, pagata }: { id: string; pagata: boolean; numero?: string }) => segna(id, pagata),
    onSuccess: (_, { id, pagata, numero }) => {
      invalida();
      // Un clic sbagliato si annulla dal messaggio stesso.
      toast.success(pagata ? `Fattura ${numero ?? ""}: ${PAROLE_PAGAMENTO_RICEVUTA.fatto.toLowerCase()}` : `Fattura ${numero ?? ""} ${PAROLE_PAGAMENTO_RICEVUTA.annulla}`, {
        action: {
          label: "Annulla",
          onClick: () => { void segna(id, !pagata).then(invalida).catch((e) => toast.error("Non annullato", { description: e instanceof Error ? e.message : undefined })); },
        },
      });
    },
    onError: (e) => toast.error("Non sono riuscito a segnarla", { description: e instanceof Error ? e.message : String(e) }),
  });
}

/** Le parole, in un posto solo: se il titolare ne preferisce altre, si cambiano qui. */
export const PAROLE_PAGAMENTO_RICEVUTA = { fatto: "Pagata", azione: "Segna pagata", annulla: "di nuovo da pagare" };

/**
 * Tre forme, una per posto:
 * - `chip`: nella colonna Stato, solo quando è pagata («Pagata 15/10», clic per tornare indietro);
 * - `icona`: tra le azioni della riga, solo quando è da pagare (una spunta, senza testo);
 * - `pulsante`: nella scheda da telefono, sempre, con le parole.
 */
export function PagamentoRicevutaCella({
  id, numero, tipo, pagataIl, forma = "pulsante",
}: { id: string; numero: string; tipo: string; pagataIl: string | null | undefined; forma?: "chip" | "icona" | "pulsante" }) {
  const segna = useSegnaRicevutaPagata();
  const inCorso = segna.isPending && segna.variables?.id === id;
  if (isNotaCreditoRicevuta(tipo)) return null;
  const P = PAROLE_PAGAMENTO_RICEVUTA;
  if (pagataIl) {
    if (forma === "icona") return null;
    return (
      <button
        type="button"
        disabled={inCorso}
        onClick={() => segna.mutate({ id, pagata: false, numero })}
        title={`${P.fatto}: clic per segnarla ${P.annulla}`}
        className="group inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100"
      >
        {inCorso ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Check className="h-2.5 w-2.5 group-hover:hidden" />}
        {!inCorso && <Undo2 className="hidden h-2.5 w-2.5 group-hover:inline" />}
        {P.fatto} {formatDateShort(pagataIl)}
      </button>
    );
  }
  if (forma === "chip") return null;
  if (forma === "icona") {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled={inCorso}
        onClick={() => segna.mutate({ id, pagata: true, numero })}
        title={P.azione}
        aria-label={`${P.azione}: fattura ${numero}`}
      >
        {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={inCorso}
      onClick={() => segna.mutate({ id, pagata: true, numero })}
      className={cn("h-8 gap-1 px-2.5 text-xs")}
    >
      {inCorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      {P.azione}
    </Button>
  );
}
