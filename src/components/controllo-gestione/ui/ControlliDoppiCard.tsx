/**
 * Controllo di gestione → Controllo dei dati: «Niente contato due volte».
 * Legge cdg_controllo_doppi(azienda): quote di banca oltre il movimento, incassi oltre la
 * fattura, spese da banca su debiti già aperti, previsioni non sostituite, prima nota doppia,
 * ripartizioni incomplete, fatture su ordine e commessa, scadenze e rate sullo stesso costo.
 * Non corregge niente: dice cosa c'è e cosa fare. docs/automazioni-tesoreria-cdg.md §3.
 */
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatEuro } from "@/lib/controlloGestione/indiciBanca";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export interface RilievoDoppio { controllo: string; ids: string[]; importo: number | null; descrizione: string; cosa_fare: string }

export const TITOLO_CONTROLLO: Record<string, string> = {
  movimento_oltre_importo: "Movimento collegato oltre il suo importo",
  documento_oltre_totale: "Fattura incassata oltre il totale",
  spesa_da_banca_su_debito_aperto: "Spesa dalla banca su un debito già registrato",
  previsione_non_sostituita: "Previsione non sostituita dalla fattura",
  prima_nota_doppia: "Prima nota doppia",
  allocazioni_non_100: "Costo ripartito su commesse per meno del 100%",
  fattura_su_ordine_e_su_commessa: "Fattura contata sull'ordine e sulla commessa",
  scadenza_e_rata_sullo_stesso_costo: "Scadenze e rate sullo stesso costo",
};

export function ControlliDoppiCard() {
  const t = useT();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const q = useQuery({
    queryKey: ["cdg-controllo-doppi", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cdg_controllo_doppi" as never, { p_company: companyId } as never);
      if (error) throw error;
      return (data ?? []) as unknown as RilievoDoppio[];
    },
  });
  // Senza permesso (42501) la scheda non mostra niente di questo; gli altri errori si vedono.
  const codice = (q.error as { code?: string } | null)?.code;
  if (q.isError && codice === "42501") return null;
  const rilievi = q.data ?? [];
  return (
    <Card className="rounded-2xl" id="doppi-conteggi">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Copy className="h-4 w-4" /> {t("Niente contato due volte")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("Budget, consuntivo e cassa: dove lo stesso denaro o lo stesso costo rischia di contare due volte.")}</p>
      </CardHeader>
      <CardContent>
        {q.isLoading ? <Skeleton className="h-16 w-full" /> : q.isError ? (
          <p className="text-sm text-destructive">{t("Controllo non riuscito:")} {(q.error as Error | null)?.message ?? t("errore sconosciuto")}</p>
        ) : rilievi.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {t("Nessun doppio conteggio trovato.")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {rilievi.map((r, i) => (
              <li key={`${r.controllo}-${r.ids.join("-")}-${i}`} className="space-y-0.5 px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-medium">{TITOLO_CONTROLLO[r.controllo] ? t(TITOLO_CONTROLLO[r.controllo]) : r.controllo}</span>
                  {r.importo != null && <span className="text-sm font-semibold tabular-nums">{formatEuro(Number(r.importo))}</span>}
                </div>
                <p className="text-xs text-muted-foreground">{r.descrizione}</p>
                <p className="text-xs">{r.cosa_fare}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
