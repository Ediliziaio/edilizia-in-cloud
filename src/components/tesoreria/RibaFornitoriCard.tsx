// ============================================================================
// RiBa ai fornitori — che cosa la banca addebiterà, e se sul conto c'è
// ----------------------------------------------------------------------------
// Una RiBa non la paghi tu: la banca la avvisa e alla scadenza la addebita da
// sola. Puoi solo bloccarla prima. Se quel giorno la provvista manca, va
// insoluta. Per questo sta in Tesoreria, accanto al saldo, e non nella lista
// dei costi: la domanda è «questo mese ci sono i soldi per le RiBa?».
//
// Legge `v_riba_fornitori`: una riga per RiBa, da `rate_fornitori` (dal
// 29/10/2026 ogni RiBa è una riga a sé, anche le quattro di una stessa
// fattura). Due tipi di stato:
//   · CALCOLATI dalla data: in arrivo, passata, futura. «Passata» non vuol
//     dire «pagata»: la data è passata e nessuno l'ha registrata — addebitata,
//     o insoluta. Lo dice l'estratto conto, non la pagina;
//   · REGISTRATI da una persona, dal menu di ogni riga: avvisata dalla banca,
//     pagata, da bloccare, richiamata, insoluta. Restano chi e quando.
// Segnare pagate tutte le RiBa di una fattura segna pagato il costo, da solo;
// toglierne una lo riapre, senza toccare le altre.
//
// Se l'azienda non ha RiBa il riquadro non c'è: niente rumore per chi paga
// solo con bonifico.
// ============================================================================

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRight, CalendarClock, Landmark, MoreHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/queryKeys";
import {
  AZIONI_RIBA,
  riepilogoRiba,
  type RibaFornitore,
  type StatoRegistrato,
} from "@/lib/costi/ribaFornitori";

// La vista e la tabella delle rate sono del 29/10/2026 e in `types.ts` non ci
// sono: su questo progetto i tipi generati non si rigenerano a ogni migrazione.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function etichettaStato(r: RibaFornitore): { testo: string; classe: string } {
  if (r.stato === "in_arrivo") {
    const g = r.giorni ?? 0;
    return {
      testo: g <= 0 ? "Oggi" : g === 1 ? "Domani" : `Tra ${g} giorni`,
      classe: g <= 7
        ? "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-900/30 dark:text-amber-300"
        : "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-900 dark:bg-sky-900/30 dark:text-sky-300",
    };
  }
  if (r.stato === "passata") {
    return {
      testo: "Passata: addebitata?",
      classe: "border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-900 dark:bg-rose-900/30 dark:text-rose-300",
    };
  }
  if (r.stato === "avvisata") {
    return {
      testo: r.giorni != null ? `Avvisata · tra ${r.giorni} gg` : "Avvisata",
      classe: "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-900 dark:bg-sky-900/30 dark:text-sky-300",
    };
  }
  if (r.stato === "da_bloccare") {
    return {
      testo: "Da bloccare",
      classe: "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-900 dark:bg-orange-900/30 dark:text-orange-300",
    };
  }
  if (r.stato === "richiamata") {
    return { testo: "Richiamata", classe: "border-slate-300 bg-slate-100 text-slate-600" };
  }
  if (r.stato === "insoluta") {
    return {
      testo: "Insoluta",
      classe: "border-rose-400 bg-rose-200 text-rose-800 dark:border-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
    };
  }
  if (r.stato === "senza_data") {
    return { testo: "Senza data", classe: "border-slate-300 bg-slate-100 text-slate-700" };
  }
  return { testo: "Più avanti", classe: "border-slate-300 bg-slate-100 text-slate-600" };
}

export function RibaFornitoriCard({
  companyId,
  liquidita,
}: {
  companyId: string;
  /** Il saldo dei conti collegati; NULL se nessun conto è collegato. */
  liquidita: number | null;
}) {
  const { data: righe = [] } = useQuery<RibaFornitore[]>({
    queryKey: ["riba-fornitori", companyId],
    queryFn: async () => {
      const { data, error } = await db
        .from("v_riba_fornitori")
        .select("rata_id, cost_id, fornitore, order_code, numero_fattura, numero_rata, rate_riba_della_fattura, scadenza, importo, stato, giorni")
        .eq("company_id", companyId)
        .neq("stato", "pagata")
        .order("scadenza", { ascending: true, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as RibaFornitore[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const queryClient = useQueryClient();
  const cambiaStato = useMutation({
    mutationFn: async ({ rataId, stato }: { rataId: string; stato: StatoRegistrato }) => {
      // `.select` perché una regola che non lascia scrivere non dà errore:
      // aggiorna zero righe in silenzio, e il salvataggio sembrerebbe riuscito.
      const { data, error } = await db
        .from("rate_fornitori")
        .update({ stato })
        .eq("id", rataId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Non hai il permesso di modificare i costi di questa azienda.");
      }
    },
    onSuccess: (_d, v) => {
      toast.success(AZIONI_RIBA.find((a) => a.stato === v.stato)?.label ?? "Stato aggiornato");
      queryClient.invalidateQueries({ queryKey: ["riba-fornitori", companyId] });
      // Pagare tutte le RiBa di una fattura paga il costo: anche i Costi cambiano.
      queryClient.invalidateQueries({ queryKey: queryKeys.costs.all });
    },
    onError: (e: Error) => toast.error(e.message || "Stato non aggiornato"),
  });

  const r = useMemo(() => riepilogoRiba(righe, liquidita), [righe, liquidita]);

  // Prima quelle che stanno per partire, poi le passate da verificare, poi le altre.
  const ordine = {
    insoluta: 0, da_bloccare: 1, in_arrivo: 2, avvisata: 2, passata: 3,
    futura: 4, senza_data: 5, richiamata: 6, pagata: 7,
  } as const;
  const prossime = [...righe]
    .sort((a, b) => ordine[a.stato] - ordine[b.stato] || String(a.scadenza).localeCompare(String(b.scadenza)))
    .slice(0, 8);

  if (righe.length === 0) return null;

  return (
    <Card className="rounded-2xl shadow-sm xl:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Landmark className="h-4 w-4 text-primary" />
          RiBa ai fornitori
          <Badge variant="secondary" className="text-xs">{righe.length}</Badge>
        </CardTitle>
        <Link
          to="/azienda/costi?tab=spese&preset=riba"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Vedi nei costi <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {/* In arrivo: la finestra in cui va garantita la provvista */}
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" /> In arrivo nei prossimi 30 giorni
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatCurrency(r.totaleInArrivo)}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {r.inArrivo.length} RiBa
              </span>
            </p>
            {r.scoperto == null ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Nessun conto collegato: se ci sono i soldi non si può verificare.
              </p>
            ) : r.scoperto > 0 ? (
              <p className="mt-1 text-[11px] font-medium text-rose-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Mancano {formatCurrency(r.scoperto)} sul conto: rischio insoluto
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-emerald-700">Il saldo attuale le copre.</p>
            )}
          </div>

          {/* Passate e non registrate: da verificare sull'estratto conto */}
          <div className={cn("rounded-xl border p-3", r.passate.length > 0 && "border-rose-200 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/20")}>
            <p className="text-xs text-muted-foreground">Passate, non registrate</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatCurrency(r.totalePassate)}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {r.passate.length} RiBa
              </span>
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {r.passate.length > 0
                ? "Addebitate o insolute? Lo dice l'estratto conto; poi si segnano pagate dai costi."
                : "Nessuna: tutte le RiBa passate sono registrate."}
            </p>
          </div>
        </div>

        {r.insolute.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              <strong>{r.insolute.length} {r.insolute.length === 1 ? "RiBa insoluta" : "RiBa insolute"}</strong>{" "}
              per {formatCurrency(r.totaleInsolute)}: il fornitore non è stato pagato e la banca
              addebiterà le spese. Va sentito il fornitore, e va rifatto il pagamento.
            </p>
          </div>
        )}

        <div className="divide-y rounded-xl border">
          {prossime.map((x) => {
            const s = etichettaStato(x);
            return (
              <div key={`${x.cost_id}-${x.numero_rata}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-20 shrink-0 tabular-nums text-xs text-muted-foreground">
                  {x.scadenza ? formatDateIt(x.scadenza) : "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{x.fornitore ?? "Fornitore"}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {x.numero_fattura ? `Fattura ${x.numero_fattura}` : "Registrata a mano"}
                    {x.rate_riba_della_fattura > 1 ? ` · RiBa ${x.numero_rata} di ${x.rate_riba_della_fattura}` : ""}
                    {x.order_code ? ` · ${x.order_code}` : ""}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums font-medium">{formatCurrency(x.importo)}</span>
                <Badge className={cn("shrink-0 text-[10px] font-normal", s.classe)}>{s.testo}</Badge>
                {x.rata_id ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        aria-label={`Cambia lo stato della RiBa di ${x.fornitore ?? "fornitore"}`}
                        disabled={cambiaStato.isPending}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {AZIONI_RIBA.map((a, i) => (
                        <div key={a.stato}>
                          {i === AZIONI_RIBA.length - 1 && <DropdownMenuSeparator />}
                          <DropdownMenuItem
                            onClick={() => cambiaStato.mutate({ rataId: x.rata_id!, stato: a.stato })}
                          >
                            {a.label}
                          </DropdownMenuItem>
                        </div>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="h-7 w-7 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
        {righe.length > prossime.length && (
          <p className="text-[11px] text-muted-foreground">
            E altre {righe.length - prossime.length}: tutte nei costi, col filtro RiBa.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
