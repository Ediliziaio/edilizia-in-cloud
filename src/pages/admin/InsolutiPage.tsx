import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, Gift, ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { formatInsolutiEuro as euro, paymentStatusLabel, reminderStatusLabel, paymentFailureLabel, plannedRecoveryAction } from "@/lib/adminInsoluti";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface RigaInsoluto {
  azienda_id: string;
  azienda: string;
  email: string | null;
  stato_azienda: string;
  piano: string | null;
  canone_mensile: number | null;
  stato_stripe: string | null;
  stato_solleciti: string | null;
  pagamenti_falliti: number | null;
  primo_fallimento: string | null;
  motivo_fallimento: string | null;
  giorni_scaduto: number | null;
  fascia_anzianita: string;
  fatture_aperte: number;
  importo_dovuto: number;
  prossima_azione: string;
  in_omaggio: boolean | null;
}

const COLORE_FASCIA: Record<string, string> = {
  "0-7 giorni": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "8-14 giorni": "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  "15-30 giorni": "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  "oltre 30 giorni": "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100",
};

/**
 * Cruscotto insoluti (F2-08).
 *
 * Risponde alle quattro domande del recupero crediti che prima richiedevano una
 * query SQL a mano: chi non ha pagato, quanto deve, da quanti giorni, e cosa
 * succede adesso.
 */
export default function InsolutiPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-insoluti", "readable-v2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_insoluti" as never)
        .select("*")
        .order("giorni_scaduto", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as RigaInsoluto[];
    },
    staleTime: 60_000,
  });

  const righe = data ?? [];
  const daRecuperare = righe.filter((r) => !r.in_omaggio);
  const totaleDovuto = daRecuperare.reduce((s, r) => s + (r.importo_dovuto ?? 0), 0);
  const inSospensione = daRecuperare.filter((r) =>
    r.prossima_azione?.startsWith("sospensione automatica"),
  ).length;

  return (
    <div className="p-3 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <AlertTriangle className="h-6 w-6 text-amber-500" />
        <div>
          <h1 className="text-xl font-semibold">Insoluti</h1>
          <p className="text-sm text-muted-foreground">
            Chi non ha pagato, quanto deve, da quanto tempo e cosa succede adesso
          </p>
        </div>
        <Button variant="outline" className="sm:ml-auto gap-2" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Aggiorna
        </Button>
      </div>

      <div aria-busy={isLoading} className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Da recuperare</p>
          <p className="text-2xl font-semibold tabular-nums text-destructive">{isLoading ? "…" : error ? "—" : euro(totaleDovuto)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isLoading ? "Caricamento posizioni…" : error ? "Dati non disponibili" : `${daRecuperare.length} ${daRecuperare.length === 1 ? "azienda" : "aziende"}`}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Sospensione prevista</p>
          <p className={`text-2xl font-semibold tabular-nums ${inSospensione > 0 ? "text-amber-600" : ""}`}>
            {isLoading ? "…" : error ? "—" : inSospensione}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">secondo le regole di recupero</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Oltre 30 giorni</p>
          <p className="text-2xl font-semibold tabular-nums">
            {isLoading ? "…" : error ? "—" : daRecuperare.filter((r) => r.fascia_anzianita === "oltre 30 giorni").length}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">credito più anziano</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">In omaggio</p>
          <p className="text-2xl font-semibold tabular-nums text-muted-foreground">
            {isLoading ? "…" : error ? "—" : righe.filter((r) => r.in_omaggio).length}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">escluse dal recupero</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isLoading ? "Caricamento…" : error ? "Posizioni non disponibili" : `${righe.length} ${righe.length === 1 ? "posizione" : "posizioni"}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {error && (
            <div role="alert" className="p-6 space-y-3"><p className="text-sm text-destructive">Impossibile caricare le posizioni insolute.</p><Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>Riprova</Button></div>
          )}

          {isLoading && (
            <div className="p-4 space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          )}

          {!isLoading && !error && righe.length === 0 && (
            <p className="text-sm text-muted-foreground px-6 pb-6">
              Nessuna posizione insoluta segnalata dal sistema.
            </p>
          )}

          {!isLoading && !error && righe.length > 0 && (
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Azienda</TableHead>
                  <TableHead>Piano</TableHead>
                  <TableHead className="text-right">Dovuto</TableHead>
                  <TableHead>Scaduto da</TableHead>
                  <TableHead>Stato pagamento</TableHead>
                  <TableHead>Cosa succede</TableHead>
                  <TableHead><span className="sr-only">Apri azienda</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {righe.map((r) => (
                  <TableRow key={r.azienda_id} className={r.in_omaggio ? "opacity-60" : undefined}>
                    <TableCell>
                      <p className="font-medium text-sm">{r.azienda}</p>
                      <p className="text-xs text-muted-foreground">{r.email ?? "—"}</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.piano ?? "—"}
                      {r.canone_mensile != null && (
                        <span className="block text-xs text-muted-foreground">
                          {Number(r.canone_mensile).toLocaleString("it-IT", {
                            style: "currency", currency: "EUR",
                          })}/mese
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {euro(r.importo_dovuto)}
                      {r.fatture_aperte > 0 && (
                        <span className="block text-xs text-muted-foreground font-normal">
                          {r.fatture_aperte} {r.fatture_aperte === 1 ? "fattura" : "fatture"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.giorni_scaduto != null ? (
                        <Badge variant="secondary" className={`text-xs ${COLORE_FASCIA[r.fascia_anzianita] ?? ""}`}>
                          {r.giorni_scaduto} {r.giorni_scaduto === 1 ? "giorno" : "giorni"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {r.primo_fallimento && (
                        <span className="block text-[11px] text-muted-foreground mt-0.5">
                          dal {format(new Date(r.primo_fallimento), "d MMM", { locale: it })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <p className="font-medium">{paymentStatusLabel(r.stato_stripe)}</p>
                      {r.stato_solleciti && r.stato_solleciti !== "none" && (
                        <p className="text-muted-foreground mt-1">{reminderStatusLabel(r.stato_solleciti)}</p>
                      )}
                      {r.motivo_fallimento && <p className="text-muted-foreground mt-1 max-w-[220px]">{paymentFailureLabel(r.motivo_fallimento)}</p>}
                      <details className="mt-2 text-muted-foreground max-w-[240px]">
                        <summary className="cursor-pointer focus-visible:outline focus-visible:outline-2">Dettagli pagamento</summary>
                        <p className="mt-1 break-words">Stripe: {r.stato_stripe ?? "non disponibile"} · Solleciti: {r.stato_solleciti ?? "non disponibile"}</p>
                        {r.motivo_fallimento && <p className="mt-1 break-words">{r.motivo_fallimento}</p>}
                        {r.pagamenti_falliti != null && <p className="mt-1">Tentativi falliti: {r.pagamenti_falliti}</p>}
                      </details>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.in_omaggio ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Gift className="h-3 w-3" /> in omaggio
                        </span>
                      ) : (
                        <span className={
                          r.prossima_azione?.startsWith("sospensione") ? "text-destructive font-medium" : ""
                        }>
                          {plannedRecoveryAction(r.prossima_azione)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link aria-label={`Apri azienda ${r.azienda}`} to={`/admin/aziende/${r.azienda_id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Gli importi derivano dalle fatture aperte. Le azioni indicate sono quelle previste dalle regole di recupero:
        verifica lo stato effettivo nella scheda azienda e l’esecuzione delle automazioni in Operazioni.
      </p>
    </div>
  );
}
