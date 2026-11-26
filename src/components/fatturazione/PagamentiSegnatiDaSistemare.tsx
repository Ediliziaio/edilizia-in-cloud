/**
 * «Segnate pagate, ma i soldi non risultano usciti» (26/11/2026, Impresa Vulcano).
 *
 * Una fattura può risultare pagata mentre il calcolo del residuo dice che quei soldi si
 * devono ancora: succede quando le bandierine vengono accese senza passare da
 * `registra_pagamento_costo`, che è quello che scrive il pagamento in prima nota. Finché
 * la riga sta in quello stato il pagamento vero, quando arriva in banca, non ha più niente
 * a cui attaccarsi — ed è il muro contro cui si è fermata la riconciliazione di una
 * distinta RiBa da 94.198 €.
 *
 * Qui si vede e si corregge: «Riapri» rimette quelle rate fra quelle da pagare, e da lì
 * l'azienda sceglie — riconciliarle col movimento, oppure «Segna pagata» dalla fattura,
 * che la scrittura la registra davvero. La seconda strada vale per chi la banca non ce
 * l'ha collegata, che è il motivo per cui segnare a mano deve restare possibile.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/formatters";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { toast } from "sonner";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface RigaDaSistemare {
  costo_id: string;
  numero_fattura: string | null;
  fornitore: string | null;
  scadenza: string | null;
  residuo: number;
}

const chiamata = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc.bind(supabase) as unknown as (
    f: string, a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

export function PagamentiSegnatiDaSistemare({ companyId }: { companyId?: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [conferma, setConferma] = useState(false);

  const elenco = useQuery({
    queryKey: ["pagamenti-segnati-da-sistemare", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () =>
      ((await chiamata("pagamenti_segnati_da_sistemare", { p_company: companyId })) ??
        []) as RigaDaSistemare[],
  });

  const riapri = useMutation({
    mutationFn: async () =>
      (await chiamata("riapri_pagamenti_segnati", {
        p_company: companyId,
        p_costi: null,
      })) as number,
    onSuccess: (quanti) => {
      toast.success(
        quanti === 1
          ? t("Un pagamento riaperto: la rata è tornata fra quelle da pagare")
          : t("{n} pagamenti riaperti: le rate sono tornate fra quelle da pagare", { n: quanti }),
      );
      refreshFinancialQueries(qc);
      void qc.invalidateQueries({ queryKey: ["pagamenti-segnati-da-sistemare"] });
      setConferma(false);
    },
    onError: (e: Error) => toast.error(t("Non sono riuscito a riaprirli"), { description: e.message }),
  });

  const righe = elenco.data ?? [];
  if (!companyId || elenco.isLoading || righe.length === 0) return null;
  const totale = righe.reduce((n, r) => n + Number(r.residuo || 0), 0);
  const primi = righe.slice(0, 3);

  return (
    <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex flex-wrap items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            {righe.length === 1
              ? t("Una fattura risulta pagata, ma il pagamento non è registrato")
              : t("{n} fatture risultano pagate, ma il pagamento non è registrato", { n: righe.length })}
            {" · "}
            {formatCurrency(totale)}
          </p>
          <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-200/80">
            {t("Finché restano così non si possono riconciliare con il movimento della banca. Riaprendole tornano fra quelle da pagare: poi le abbini al pagamento, oppure usi «Segna pagata» dalla fattura, che registra la scrittura.")}
          </p>
          <p className="mt-1 truncate text-xs text-amber-900/70 dark:text-amber-200/70">
            {primi.map((r) => `${r.numero_fattura ?? "—"} · ${r.fornitore ?? "—"}`).join(" · ")}
            {righe.length > primi.length ? ` · ${t("e altre {n}", { n: righe.length - primi.length })}` : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => setConferma(true)}>
          {t("Riapri")}
        </Button>
      </div>

      <AlertDialog open={conferma} onOpenChange={setConferma}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Riaprire {n} pagamenti?", { n: righe.length })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("Le rate tornano fra quelle da pagare, per {importo} in tutto. Non si cancella niente: le fatture restano dove sono, e chi ha pagato davvero può risegnarle pagate in un clic. Si toccano solo quelle dove il pagamento non risulta registrato.", { importo: formatCurrency(totale) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
            <AlertDialogAction disabled={riapri.isPending} onClick={() => riapri.mutate()}>
              {riapri.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {t("Riapri")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
