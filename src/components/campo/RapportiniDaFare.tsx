/**
 * I due promemoria dei rapportini nella Home dell'operaio.
 *
 *   - RapportiniDaCompilareOggi → cantieri di OGGI e di ieri in cui ha lavorato (timbrature) e non ha ancora
 *     rapportino: il promemoria che si dimentica a fine giornata.
 *   - RapportiniSospesi → rapportini di giorni PRECEDENTI rimasti in bozza o RESPINTI dall'ufficio.
 *
 * Un errore di lettura non fa sparire la scheda in silenzio: proprio con la rete debole il promemoria della scadenza
 * deve restare, almeno come «non riesco a controllare».
 */
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, ChevronRight, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCampoRapportiniDaCompilare } from "@/hooks/useCampoRapportiniDaCompilare";
import { campoWorkDay } from "@/lib/campo/workDay";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Il rapportino di quel giorno, già compilato se era respinto o in bozza. */
const rapportinoDelGiorno = (orderId: string, giorno: string) => `/campo/lavoro/${orderId}/rapportino?data=${giorno}`;

export function RapportiniDaCompilareOggi() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: cantieri = [], isLoading, isError, refetch } = useCampoRapportiniDaCompilare(user?.id);

  if (isLoading) return null;

  if (isError && cantieri.length === 0) {
    return (
      <Card role="alert" className="border-amber-300 bg-amber-50">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <p className="min-w-0 text-sm text-amber-900">Non riesco a controllare se hai rapportini da inviare.</p>
          <button type="button"
            onClick={() => { void refetch(); void queryClient.invalidateQueries({ queryKey: ["campo-rapportini-sospesi"] }); }}
            className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Riprova
          </button>
        </CardContent>
      </Card>
    );
  }

  if (cantieri.length === 0) return null;

  return (
    <Card className="border-violet-200 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-violet-800 dark:text-violet-200">
          <ClipboardList className="h-4 w-4" />
          {cantieri.length === 1 ? "Rapportino da inviare" : `${cantieri.length} rapportini da inviare`}
        </CardTitle>
        <p className="text-xs text-violet-700 dark:text-violet-300 mt-1">
          Oggi e ieri: invia entro il giorno successivo al lavoro. La timbratura di uscita va fatta separatamente.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {cantieri.slice(0, 5).map((c) => (
          <button
            key={`${c.order_id}:${c.data_lavoro}`}
            onClick={() => navigate(rapportinoDelGiorno(c.order_id, c.data_lavoro))}
            className="min-h-14 w-full flex items-center justify-between text-left rounded-lg px-2 py-2 hover:bg-violet-100/60 dark:hover:bg-violet-900/40 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground font-medium truncate">
                {c.order_code ?? "—"} · {format(parseISO(c.data_lavoro), "dd/MM")}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {c.description?.slice(0, 60) ?? "—"} · ~{c.ore_in_cantiere_stimate}h stimate
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-violet-600 shrink-0 ml-2" />
          </button>
        ))}
        {cantieri.length > 5 && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            +{cantieri.length - 5} altri cantieri
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface RapportinoSospeso {
  id: string;
  order_id: string;
  data_lavoro: string;
  stato: string;
  order: { order_code: string | null; description: string | null } | null;
}

export function RapportiniSospesi() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  // «Giorni precedenti» rispetto a oggi in Italia, non a oggi sul telefono.
  const today = campoWorkDay();

  const { data: rapportini = [], isError, refetch } = useQuery({
    queryKey: ["campo-rapportini-sospesi", user?.id, companyId],
    queryFn: async (): Promise<RapportinoSospeso[]> => {
      // Filtro azienda: i rapportini sono dell'utente ma restano nel tenant
      // in cui sono nati — cambiando azienda i vecchi non devono riapparire
      // come "da completare" (e il link aprirebbe un cantiere non accessibile).
      //
      // "Da completare" = bozza mai inviata o rapportino RESPINTO dall'ufficio.
      // Prima il filtro era lavoro_completato=false, ma quel flag significa
      // "il CANTIERE è finito": ogni rapportino normale di un cantiere aperto
      // restava segnato per sempre come sospeso, anche se già inviato — la
      // card gridava al lupo tutti i giorni e i veri sospesi si perdevano.
      const { data, error } = await supabase
        .from("campo_rapportini")
        .select("id, order_id, data_lavoro, stato, order:orders(order_code, description)")
        .eq("user_id", user!.id)
        .eq("company_id", companyId!)
        .in("stato", ["bozza", "rifiutato"])
        .lt("data_lavoro", today)
        .order("data_lavoro", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RapportinoSospeso[];
    },
    enabled: !!user?.id && !!companyId,
  });

  if (isError && rapportini.length === 0) {
    return (
      <Card role="alert" className="border-amber-300 bg-amber-50">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <p className="min-w-0 text-sm text-amber-900">Non riesco a controllare i rapportini da completare.</p>
          <button type="button" onClick={() => void refetch()}
            className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Riprova
          </button>
        </CardContent>
      </Card>
    );
  }

  if (rapportini.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          {rapportini.length} {rapportini.length === 1 ? "rapportino" : "rapportini"} da completare
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rapportini.slice(0, 3).map((r) => (
          <button
            key={r.id}
            onClick={() => navigate(rapportinoDelGiorno(r.order_id, r.data_lavoro))}
            className="min-h-14 w-full flex items-center justify-between text-left rounded-lg px-2 py-2 hover:bg-amber-100/50 transition-colors"
          >
            <div>
              <p className="text-sm text-foreground font-medium">
                {r.order?.order_code}
                {r.stato === "rifiutato" && (
                  <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-red-600">
                    Respinto — da rifare
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(parseISO(r.data_lavoro), "d MMM", { locale: it })} — {r.order?.description?.slice(0, 40)}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-amber-600 shrink-0" />
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
