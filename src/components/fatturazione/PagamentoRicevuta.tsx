import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { annullaSaldoRicevuta, registraSaldoRicevuta, messaggioPagamentoRicevuta } from "@/lib/fatturazione/saldoRapidoRicevuta";
import { Button } from "@/components/ui/button";
import { formatDateShort } from "@/lib/formatters";
import { queryKeys } from "@/lib/queryKeys";
import { eNotaDiCredito, nonSiPaga } from "@/lib/fatturazione/noteDiCredito";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/**
 * «L'ho pagata» sulle fatture dei fornitori, con un clic. La data sta sulla fattura
 * (`pagata_il`); se la fattura è contabilizzata e ha le rate, anche le rate diventano
 * pagate e con loro costo e scadenzario. Vale per chi
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
  return eNotaDiCredito(tipo);
}

export function useSegnaRicevutaPagata() {
  const t = useT();
  const queryClient = useQueryClient();
  const invalida = () => {
    refreshFinancialQueries(queryClient);
    void queryClient.invalidateQueries({ queryKey: ["fatture-ricevute-pagamento"] });
    void queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
    void queryClient.invalidateQueries({ queryKey: ["fattura-ricevuta-riepilogo"] });
    // Le rate pagate spostano costi, scadenzario e cassa.
    void queryClient.invalidateQueries({ queryKey: queryKeys.costs.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.scadenzario.all });
    void queryClient.invalidateQueries({ queryKey: ["cashflow"] });
  };
  return useMutation({
    mutationFn: async ({ id, pagata }: { id: string; pagata: boolean; numero?: string }) => {
      if (pagata) return registraSaldoRicevuta(id);
      await annullaSaldoRicevuta(id);
      return null;
    },
    onSuccess: (annullamento, { id, pagata, numero }) => {
      invalida();
      if (pagata && !annullamento) {
        toast.success(t("Fattura {numero} già saldata", { numero: numero ?? "" }));
        return;
      }
      const messaggio = pagata ? t("Fattura {numero}: pagata", { numero: numero ?? "" }) : t("Fattura {numero}: saldo annullato", { numero: numero ?? "" });
      toast.success(messaggio, annullamento ? {
        action: {
          label: t("Annulla"),
          onClick: () => {
            void annullaSaldoRicevuta(id, annullamento).then(invalida)
              .catch((e) => toast.error(t("Non annullato"), { description: messaggioPagamentoRicevuta(e) }));
          },
        },
      } : undefined);
    },
    onError: (e) => toast.error(t("Pagamento non aggiornato"), { description: messaggioPagamentoRicevuta(e) }),
  });
}

/** Le parole, in un posto solo: se il titolare ne preferisce altre, si cambiano qui. */
export const PAROLE_PAGAMENTO_RICEVUTA = { fatto: "Pagata", azione: "Segna pagata", annulla: "annulla il saldo" };

/**
 * Tre forme, una per posto:
 * - `chip`: nella colonna Stato, solo quando è pagata («Pagata 15/10», clic per tornare indietro);
 * - `icona`: tra le azioni della riga, solo quando è da pagare (una spunta, senza testo);
 * - `pulsante`: nella scheda da telefono, sempre, con le parole.
 */
export function PagamentoRicevutaCella({
  id, numero, tipo, pagataIl, forma = "pulsante",
}: { id: string; numero: string; tipo: string; pagataIl: string | null | undefined; forma?: "chip" | "icona" | "pulsante" }) {
  const t = useT();
  const segna = useSegnaRicevutaPagata();
  const inCorso = segna.isPending && segna.variables?.id === id;
  if (nonSiPaga(tipo)) return null;
  const P = PAROLE_PAGAMENTO_RICEVUTA;
  if (pagataIl) {
    if (forma === "icona") return null;
    return (
      <button
        type="button"
        disabled={inCorso}
        onClick={() => segna.mutate({ id, pagata: false, numero })}
        title={`${t(P.fatto)} · ${t(P.annulla)}`}
        className="group inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100"
      >
        {inCorso ? <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin" /> : <Check className="h-2.5 w-2.5 shrink-0 group-hover:hidden" />}
        {!inCorso && <Undo2 className="hidden h-2.5 w-2.5 shrink-0 group-hover:inline" />}
        {t(P.fatto)} {formatDateShort(pagataIl)}
      </button>
    );
  }
  if (forma === "chip") return null;
  if (forma === "icona") {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        disabled={inCorso}
        onClick={() => segna.mutate({ id, pagata: true, numero })}
        title={t(P.azione)}
        aria-label={t("{azione}: fattura {numero}", { azione: t(P.azione), numero: String(numero ?? "") })}
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
      {t(P.azione)}
    </Button>
  );
}
